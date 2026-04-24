package com.lynxal.argus.server.buffer

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.server.protocol.OutboundMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ChannelResult
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.coroutines.CoroutineContext

/**
 * In-memory ring of recent [ArgusEvent]s plus a live fan-out to WebSocket subscribers.
 *
 * ### Concurrency model
 *
 * A single actor coroutine pinned to `Dispatchers.Default.limitedParallelism(1)` drains
 * an unbounded [Channel] of [Op]s. All mutation of the backing [ArrayDeque] happens on
 * that actor; readers see a published immutable snapshot through [snapshot] (a
 * [StateFlow] so subscribers can also observe the snapshot-length transitions if they
 * wish).
 *
 * [offer] and [clear] are non-suspend and safe to call from any thread. They delegate
 * to `Channel.trySend` on an unbounded channel — never blocks, never drops.
 *
 * ### Fan-out
 *
 * Each WebSocket subscriber calls [subscribe], receiving a bounded [ReceiveChannel].
 * When the actor publishes an event it `trySend`s to every subscriber. If a subscriber's
 * channel is full (slow consumer) the actor closes that subscriber's channel, signalling
 * the WS route to shut the socket with WebSocket close code 1011 / reason `"lagging"`.
 * The client then reconnects, re-snapshots via `GET /api/events`, and re-subscribes.
 *
 * ### Buffer policy
 *
 * A single [maxEvents]-capped deque shared across `HttpEvent` / `LogEvent` / `CustomEvent` —
 * oldest event is evicted first when capacity is reached. [clear] empties the deque and
 * pushes `OutboundMessage.Cleared` to every subscriber.
 */
public class EventRingBuffer internal constructor(
    private val maxEvents: Int,
    parentContext: CoroutineContext = SupervisorJob() + Dispatchers.Default.limitedParallelism(1),
) {

    private val scope = CoroutineScope(parentContext)
    private val inbox: Channel<Op> = Channel(capacity = Channel.UNLIMITED)
    private val events = ArrayDeque<ArgusEvent>(maxEvents)

    private val _snapshot = MutableStateFlow<List<ArgusEvent>>(emptyList())
    public val snapshot: StateFlow<List<ArgusEvent>> get() = _snapshot

    private val _subscribers = MutableStateFlow<List<SendChannel<OutboundMessage>>>(emptyList())

    init {
        require(maxEvents > 0) { "maxEvents must be positive, got $maxEvents" }
        scope.launch { for (op in inbox) apply(op) }
    }

    public fun offer(event: ArgusEvent) {
        inbox.trySend(Op.Publish(event))
    }

    public fun clear() {
        inbox.trySend(Op.Clear)
    }

    public fun subscribe(capacity: Int = DEFAULT_SUBSCRIBER_CAPACITY): ReceiveChannel<OutboundMessage> {
        val channel = Channel<OutboundMessage>(capacity = capacity)
        _subscribers.update { it + channel }
        return channel
    }

    public fun unsubscribe(channel: ReceiveChannel<OutboundMessage>) {
        _subscribers.update { list -> list.filterNot { it === channel } }
        @Suppress("UNCHECKED_CAST")
        (channel as SendChannel<OutboundMessage>).close()
    }

    public fun close() {
        inbox.close()
        _subscribers.value.forEach { it.close() }
        _subscribers.value = emptyList()
        scope.cancel()
    }

    private fun apply(op: Op) {
        when (op) {
            is Op.Publish -> {
                if (events.size >= maxEvents) events.removeFirst()
                events.addLast(op.event)
                _snapshot.value = events.toList()
                broadcast(OutboundMessage.Event(op.event))
            }
            Op.Clear -> {
                events.clear()
                _snapshot.value = emptyList()
                broadcast(OutboundMessage.Cleared)
            }
        }
    }

    private fun broadcast(message: OutboundMessage) {
        val currentSubs = _subscribers.value
        val failed = mutableListOf<SendChannel<OutboundMessage>>()
        for (sub in currentSubs) {
            val result: ChannelResult<Unit> = sub.trySend(message)
            if (result.isFailure && !result.isClosed) failed.add(sub)
            else if (result.isClosed) failed.add(sub)
        }
        if (failed.isNotEmpty()) {
            _subscribers.update { list -> list.filterNot { it in failed } }
            for (sub in failed) sub.close()
        }
    }

    private sealed interface Op {
        data class Publish(val event: ArgusEvent) : Op
        data object Clear : Op
    }

    public companion object {
        public const val DEFAULT_SUBSCRIBER_CAPACITY: Int = 1024
    }
}
