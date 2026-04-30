package com.lynxal.argus.server.buffer

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.persistence.EventStore
import com.lynxal.argus.persistence.NoopEventStore
import com.lynxal.argus.server.createTestHttpEvent
import com.lynxal.argus.server.createTestLogEvent
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class EventRingBufferHydrateTest {

    @Test
    fun `hydrate populates the ring before live events arrive`() = runTest {
        val buffer = EventRingBuffer(
            maxEvents = 10,
            parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler),
        )

        buffer.hydrate(listOf(
            createTestHttpEvent(id = "h1"),
            createTestLogEvent(id = "h2"),
        ))
        buffer.offer(createTestHttpEvent(id = "live"))
        testScheduler.runCurrent()

        assertEquals(listOf("h1", "h2", "live"), buffer.snapshot.value.map { it.id })
    }

    @Test
    fun `hydrate respects maxEvents cap`() = runTest {
        val buffer = EventRingBuffer(
            maxEvents = 3,
            parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler),
        )

        val seed = (0 until 5).map { createTestHttpEvent(id = "h$it") }
        buffer.hydrate(seed)
        testScheduler.runCurrent()

        // Newest 3 of the seed survive (takeLast(maxEvents)).
        assertEquals(listOf("h2", "h3", "h4"), buffer.snapshot.value.map { it.id })
    }

    @Test
    fun `hydrated events are not persisted again`() = runTest {
        val recorder = RecordingEventStore()
        val buffer = EventRingBuffer(
            maxEvents = 10,
            eventStore = recorder,
            sessionId = "current",
            parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler),
        )

        buffer.hydrate(listOf(createTestHttpEvent(id = "h1")))
        testScheduler.runCurrent()

        assertTrue(recorder.appended.isEmpty(), "hydrated events should bypass persistence")
    }

    @Test
    fun `hydrate with empty list is a no-op`() = runTest {
        val buffer = EventRingBuffer(
            maxEvents = 10,
            parentContext = SupervisorJob() + StandardTestDispatcher(testScheduler),
        )

        buffer.hydrate(emptyList())
        testScheduler.runCurrent()

        assertTrue(buffer.snapshot.value.isEmpty())
    }
}

private class RecordingEventStore : EventStore by NoopEventStore {
    val appended = mutableListOf<ArgusEvent>()
    override suspend fun append(event: ArgusEvent, sessionId: String, sizeBytes: Long) {
        appended += event
    }
}
