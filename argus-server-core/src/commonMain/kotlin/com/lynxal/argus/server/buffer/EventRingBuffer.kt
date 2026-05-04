package com.lynxal.argus.server.buffer

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusJson
import com.lynxal.argus.persistence.EventStore
import com.lynxal.argus.persistence.NoopEventStore
import kotlinx.coroutines.IO
import com.lynxal.argus.server.protocol.OutboundMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
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
 * Each WebSocket subscriber calls [subscribe], receiving a bounded [ReceiveChannel]
 * configured with `BufferOverflow.DROP_OLDEST`. A slow consumer therefore loses its
 * oldest queued frames rather than getting kicked off the socket; the WS stays alive
 * and resumes catching up the moment the client drains. Clients that need a complete
 * view across drops re-fetch `GET /api/events` on reconnect.
 *
 * ### Buffer policy
 *
 * A single [maxEvents]-capped deque shared across `HttpEvent` / `LogEvent` / `CustomEvent` —
 * oldest event is evicted first when capacity is reached. [clear] empties the deque and
 * pushes `OutboundMessage.Cleared` to every subscriber.
 */
public class EventRingBuffer internal constructor(
    private val maxEvents: Int,
    private val eventStore: EventStore = NoopEventStore,
    private val sessionId: String = NoopEventStore.NO_SESSION,
    private val persistMaxSizeMb: Long = 100,
    private val persistMaxAgeDays: Int = 7,
    parentContext: CoroutineContext = SupervisorJob() + Dispatchers.Default.limitedParallelism(1),
) {

    private val scope = CoroutineScope(parentContext)
    private val inbox: Channel<Op> = Channel(capacity = Channel.UNLIMITED)
    private val events = ArrayDeque<ArgusEvent>(maxEvents)

    private val _snapshot = MutableStateFlow<List<ArgusEvent>>(emptyList())
    public val snapshot: StateFlow<List<ArgusEvent>> get() = _snapshot

    private val _subscribers = MutableStateFlow<List<SendChannel<OutboundMessage>>>(emptyList())

    private val persistEnabled = eventStore !== NoopEventStore
    private var insertsSincePrune: Int = 0

    init {
        require(maxEvents > 0) { "maxEvents must be positive, got $maxEvents" }
        scope.launch { for (op in inbox) apply(op) }
    }

    /**
     * Prepend [events] from a previous session into the ring buffer without
     * broadcasting or re-persisting them. Idempotent — events already in the ring
     * keep their position. Call before any subscribers connect so the WebSocket
     * `/api/events` snapshot reflects the rehydrated state.
     */
    public fun hydrate(events: List<ArgusEvent>) {
        if (events.isEmpty()) return
        inbox.trySend(Op.Hydrate(events))
    }

    public fun offer(event: ArgusEvent) {
        inbox.trySend(Op.Publish(event))
    }

    public fun clear() {
        inbox.trySend(Op.Clear)
    }

    public fun subscribe(capacity: Int = DEFAULT_SUBSCRIBER_CAPACITY): ReceiveChannel<OutboundMessage> {
        val channel = Channel<OutboundMessage>(
            capacity = capacity,
            onBufferOverflow = BufferOverflow.DROP_OLDEST,
        )
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
                if (persistEnabled) persistAsync(op.event)
            }
            Op.Clear -> {
                events.clear()
                _snapshot.value = emptyList()
                broadcast(OutboundMessage.Cleared)
            }
            is Op.Hydrate -> {
                val incoming = op.events.takeLast(maxEvents)
                for (e in incoming) {
                    if (events.size >= maxEvents) events.removeFirst()
                    events.addLast(e)
                }
                _snapshot.value = events.toList()
                // Intentional: no broadcast (subscribers haven't connected yet) and
                // no persistence (these events are already on disk).
            }
        }
    }

    private fun persistAsync(event: ArgusEvent) {
        val sizeBytes = ArgusJson
            .encodeToString(ArgusEvent.serializer(), event)
            .encodeToByteArray()
            .size.toLong()
        scope.launch(Dispatchers.IO) {
            runCatching { eventStore.append(event, sessionId, sizeBytes) }
        }
        insertsSincePrune++
        if (insertsSincePrune >= PRUNE_EVERY) {
            insertsSincePrune = 0
            scope.launch(Dispatchers.IO) {
                runCatching { eventStore.pruneByRetention(persistMaxSizeMb, persistMaxAgeDays) }
            }
        }
    }

    private fun broadcast(message: OutboundMessage) {
        // DROP_OLDEST overflow policy on the subscriber channels means trySend can only
        // fail when a channel is closed (e.g. by unsubscribe()); prune those.
        val currentSubs = _subscribers.value
        val closed = currentSubs.filter { it.trySend(message).isClosed }
        if (closed.isNotEmpty()) {
            _subscribers.update { list -> list.filterNot { it in closed } }
        }
    }

    private sealed interface Op {
        data class Publish(val event: ArgusEvent) : Op
        data class Hydrate(val events: List<ArgusEvent>) : Op
        data object Clear : Op
    }

    public companion object {
        public const val DEFAULT_SUBSCRIBER_CAPACITY: Int = 1024
        private const val PRUNE_EVERY: Int = 50
    }
}
