package com.lynxal.argus.server.buffer

import com.lynxal.argus.server.createTestCustomEvent
import com.lynxal.argus.server.createTestHttpEvent
import com.lynxal.argus.server.createTestLogEvent
import com.lynxal.argus.server.protocol.OutboundMessage
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class EventRingBufferTest {

    @Test
    fun `offer and snapshot preserves insertion order`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 10, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))

        buffer.offer(createTestHttpEvent(id = "a"))
        buffer.offer(createTestLogEvent(id = "b"))
        buffer.offer(createTestCustomEvent(id = "c"))
        testScheduler.runCurrent()

        val ids = buffer.snapshot.value.map { it.id }
        assertEquals(listOf("a", "b", "c"), ids)
    }

    @Test
    fun `evicts oldest once cap reached`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 3, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))

        repeat(5) { buffer.offer(createTestHttpEvent(id = "evt-$it")) }
        testScheduler.runCurrent()

        val ids = buffer.snapshot.value.map { it.id }
        assertEquals(listOf("evt-2", "evt-3", "evt-4"), ids)
    }

    @Test
    fun `clear empties snapshot and signals subscribers with Cleared`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 10, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))
        val sub = buffer.subscribe()

        buffer.offer(createTestHttpEvent(id = "a"))
        buffer.clear()
        testScheduler.runCurrent()

        assertTrue(buffer.snapshot.value.isEmpty())
        val messages = drain(sub, limit = 2)
        assertTrue(messages[0] is OutboundMessage.Event)
        assertEquals(OutboundMessage.Cleared, messages[1])
    }

    @Test
    fun `subscriber receives events published after subscribe`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 10, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))
        val sub = buffer.subscribe()

        buffer.offer(createTestHttpEvent(id = "a"))
        buffer.offer(createTestLogEvent(id = "b"))
        testScheduler.runCurrent()

        val received = drain(sub, limit = 2)
        val ids = received.filterIsInstance<OutboundMessage.Event>().map { it.event.id }
        assertEquals(listOf("a", "b"), ids)
    }

    @Test
    fun `two subscribers receive same event independently`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 10, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))
        val a = buffer.subscribe()
        val b = buffer.subscribe()

        buffer.offer(createTestHttpEvent(id = "shared"))
        testScheduler.runCurrent()

        val fromA = drain(a, 1).filterIsInstance<OutboundMessage.Event>().map { it.event.id }
        val fromB = drain(b, 1).filterIsInstance<OutboundMessage.Event>().map { it.event.id }
        assertEquals(listOf("shared"), fromA)
        assertEquals(listOf("shared"), fromB)
    }

    @Test
    fun `slow subscriber drops oldest queued frames and stays open`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 100, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))
        val sub = buffer.subscribe(capacity = 2)

        // Publish more than the subscriber's channel can hold without draining.
        repeat(5) { buffer.offer(createTestHttpEvent(id = "evt-$it")) }
        testScheduler.runCurrent()

        // Channel must remain open (no lagging-close) and retain the most recent
        // `capacity` frames, dropping the oldest.
        val received = mutableListOf<String>()
        repeat(2) {
            val result = sub.tryReceive()
            assertTrue(result.isSuccess, "expected channel to remain open and yield queued frames")
            val msg = result.getOrThrow() as OutboundMessage.Event
            received.add(msg.event.id)
        }
        assertEquals(listOf("evt-3", "evt-4"), received)

        // Channel still open after draining — further publishes deliver normally.
        buffer.offer(createTestHttpEvent(id = "evt-after"))
        testScheduler.runCurrent()
        val next = sub.tryReceive()
        assertTrue(next.isSuccess)
        assertEquals("evt-after", (next.getOrThrow() as OutboundMessage.Event).event.id)
    }

    @Test
    fun `close cancels actor and drops subscribers`() = runTest {
        val buffer = EventRingBuffer(maxEvents = 10, parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler))
        val sub = buffer.subscribe()

        buffer.close()
        testScheduler.runCurrent()

        val result = sub.tryReceive()
        assertTrue(result.isClosed || result.isFailure)
        // Snapshot is not cleared by close(); only actor + subscribers are torn down.
        assertFalse(buffer.snapshot.value.isNotEmpty())
    }

    private fun drain(channel: ReceiveChannel<OutboundMessage>, limit: Int): List<OutboundMessage> {
        val out = mutableListOf<OutboundMessage>()
        while (out.size < limit) {
            val result = channel.tryReceive()
            if (result.isSuccess) out.add(result.getOrThrow())
            else break
        }
        return out
    }
}
