package com.lynxal.argus.server

import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.protocol.OutboundMessage
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Sustained-throughput smoke test for the ring buffer.
 *
 * Acceptance criterion from the feature spec: "Buffer handles 500 req/s + 500 log/s
 * combined sustained". This test publishes 1000 HTTP + 1000 log events from 8
 * parallel producers as fast as possible (materially exceeds the sustained rate)
 * and verifies the actor drains, the deque caps at [MAX_EVENTS], and an always-
 * connected subscriber receives events without being closed.
 */
class LoadTest {

    companion object {
        private const val MAX_EVENTS = 500
        private const val HTTP_EVENTS = 1000
        private const val LOG_EVENTS = 1000
    }

    @Test
    fun `sustained publish keeps up and evicts to cap`() = runBlocking {
        val buffer = EventRingBuffer(maxEvents = MAX_EVENTS)
        val subscriber = buffer.subscribe(capacity = MAX_EVENTS * 4)
        val expectedTotal = HTTP_EVENTS + LOG_EVENTS

        var received = 0
        val drainer = launch {
            for (msg in subscriber) {
                if (msg is OutboundMessage.Event) received++
                if (received >= expectedTotal) break
            }
        }

        coroutineScope {
            val producers = List(4) { workerId ->
                async {
                    repeat(HTTP_EVENTS / 4) { i ->
                        buffer.offer(createTestHttpEvent(id = "http-$workerId-$i"))
                    }
                }
            } + List(4) { workerId ->
                async {
                    repeat(LOG_EVENTS / 4) { i ->
                        buffer.offer(createTestLogEvent(id = "log-$workerId-$i"))
                    }
                }
            }
            producers.awaitAll()
        }

        withTimeout(10.seconds) {
            buffer.snapshot.first { it.size == MAX_EVENTS }
        }
        withTimeout(10.seconds) { drainer.join() }

        assertEquals(MAX_EVENTS, buffer.snapshot.value.size)
        assertTrue(received >= expectedTotal, "subscriber should see all events (got $received of $expectedTotal)")
        buffer.close()
    }
}
