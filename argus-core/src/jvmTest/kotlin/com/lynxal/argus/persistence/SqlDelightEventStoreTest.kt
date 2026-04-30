package com.lynxal.argus.persistence

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusJson
import com.lynxal.argus.model.EventSource
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.HttpRequest
import com.lynxal.argus.model.LogEvent
import com.lynxal.logging.LogLevel
import kotlinx.coroutines.test.runTest
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SqlDelightEventStoreTest {

    private val now = AtomicLongRef(0L)
    private val factory = TestArgusDriverFactory()
    private val store = SqlDelightEventStore(factory) { now.value }

    @AfterTest fun teardown() = store.close()

    private fun http(id: String, ts: Long, correlationId: String? = null): HttpEvent =
        HttpEvent(
            id = id,
            timestamp = ts,
            request = HttpRequest("GET", "https://x/$id", "x", "/$id", emptyList()),
            correlationId = correlationId,
        )

    private fun log(id: String, ts: Long, correlationId: String? = null): LogEvent =
        LogEvent(
            id = id,
            timestamp = ts,
            level = LogLevel.Info,
            message = "m-$id",
            correlationId = correlationId,
        )

    private fun bytesOf(event: ArgusEvent): Long =
        ArgusJson.encodeToString(ArgusEvent.serializer(), event).encodeToByteArray().size.toLong()

    @Test
    fun `previousSessionEvents returns the prior session's events`() = runTest {
        now.value = 1_000
        store.append(http("a", 1_001), "s1", bytesOf(http("a", 1_001)))
        store.append(log("b", 1_002), "s1", bytesOf(log("b", 1_002)))

        now.value = 2_000
        store.append(http("c", 2_001), "s2", bytesOf(http("c", 2_001)))

        // Restart: session s3 opens.
        val rehydrated = store.previousSessionEvents("s3", maxEvents = 100)
        assertEquals(listOf("c"), rehydrated.map { it.id })
    }

    @Test
    fun `previousSessionEvents returns empty when only the current session has events`() = runTest {
        now.value = 1_000
        store.append(http("a", 1_001), "current", 100)
        assertTrue(store.previousSessionEvents("current", 100).isEmpty())
    }

    @Test
    fun `previousSessionEvents respects maxEvents cap`() = runTest {
        now.value = 1_000
        repeat(5) { i -> store.append(http("e$i", 1_000L + i), "s1", 50) }

        val rehydrated = store.previousSessionEvents("current", maxEvents = 3)
        assertEquals(listOf("e0", "e1", "e2"), rehydrated.map { it.id })
    }

    @Test
    fun `pruneByRetention drops events older than maxAgeDays`() = runTest {
        val dayMs = 86_400_000L
        now.value = 10 * dayMs
        store.append(http("old", 1 * dayMs), "s1", 50)         // 9 days old
        store.append(http("recent", 9 * dayMs), "s1", 50)      // 1 day old

        store.pruneByRetention(maxSizeMb = 1_000, maxAgeDays = 7)

        assertEquals(listOf("recent"), store.previousSessionEvents("current", 100).map { it.id })
    }

    @Test
    fun `pruneByRetention drops oldest events when size cap exceeds`() = runTest {
        now.value = 1_000_000
        repeat(3) { i ->
            // 600 KB each → 1.8 MB total; cap of 1 MB should leave the newest one(s).
            store.append(http("e$i", 1_000_000L + i), "s1", 600 * 1024)
        }

        store.pruneByRetention(maxSizeMb = 1, maxAgeDays = 365)

        val remaining = store.previousSessionEvents("current", 100).map { it.id }
        assertTrue("e0" !in remaining, "oldest must be evicted first")
        assertTrue(remaining.isNotEmpty(), "newest events should be retained")
    }

    @Test
    fun `appended event payload round-trips with correlationId preserved`() = runTest {
        now.value = 1_000
        val event = http("rt", 1_001, correlationId = "trace-1")
        store.append(event, "s1", bytesOf(event))

        val rehydrated = store.previousSessionEvents("current", 100).single() as HttpEvent
        assertEquals("trace-1", rehydrated.correlationId)
        assertEquals(EventSource.HTTP, rehydrated.source)
    }

    @Test
    fun `previousSessionEvents picks the session with the newest event when multiple exist`() = runTest {
        now.value = 1_000
        store.append(http("a", 1_001), "old", 50)
        store.append(http("b", 5_000), "newer", 50)
        store.append(http("c", 3_000), "middle", 50)

        val rehydrated = store.previousSessionEvents("current", 100).map { it.id }
        assertEquals(listOf("b"), rehydrated)
    }
}

private class AtomicLongRef(var value: Long)
