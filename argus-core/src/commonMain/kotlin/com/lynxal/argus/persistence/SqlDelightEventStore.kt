@file:OptIn(ExperimentalUuidApi::class, ExperimentalTime::class)

package com.lynxal.argus.persistence

import com.lynxal.argus.db.ArgusDatabase
import com.lynxal.argus.db.ArgusDriverFactory
import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.uuid.ExperimentalUuidApi

/**
 * SQLDelight-backed [EventStore]. All DB access is dispatched onto [Dispatchers.IO]
 * so the ring buffer actor stays single-threaded and never blocks on disk. The
 * `import kotlinx.coroutines.IO` is required for Kotlin/Native — `Dispatchers.IO` is
 * an extension property there, not a member, so the IDE flags it "redundant" on JVM
 * but removing it breaks the iOS build.
 *
 * Concurrency: writes funnel through a [Mutex] so `append` from concurrent emitters
 * never interleaves with `pruneByRetention` mid-write. Reads (`previousSessionEvents`)
 * acquire the same mutex to see a consistent post-prune view.
 *
 * Build the driver via the platform [ArgusDriverFactory] (Android: `AndroidArgusDriverFactory`
 * in `:argus-android`; iOS: deferred to Phase 4).
 */
public class SqlDelightEventStore(
    factory: ArgusDriverFactory,
    private val nowMs: () -> Long = { Clock.System.now().toEpochMilliseconds() },
) : EventStore {

    private val driver = factory.create()
    private val db = ArgusDatabase(driver)
    private val mutex = Mutex()

    override suspend fun append(event: ArgusEvent, sessionId: String, sizeBytes: Long) {
        val payload = ArgusJson.encodeToString(ArgusEvent.serializer(), event)
        withContext(Dispatchers.IO) {
            mutex.withLock {
                db.argusQueries.insertEvent(
                    id = event.id,
                    session_id = sessionId,
                    timestamp_ms = event.timestamp,
                    source = event.source.name,
                    correlation_id = event.correlationIdOrNull(),
                    size_bytes = sizeBytes,
                    payload = payload,
                )
            }
        }
    }

    override suspend fun previousSessionEvents(
        currentSessionId: String,
        maxEvents: Int,
    ): List<ArgusEvent> = withContext(Dispatchers.IO) {
        mutex.withLock {
            val sessionId = db.argusQueries.previousSessionId(currentSessionId)
                .executeAsOneOrNull() ?: return@withLock emptyList()
            db.argusQueries
                .eventsForSession(sessionId, maxEvents.toLong())
                .executeAsList()
                .map { payload -> ArgusJson.decodeFromString(ArgusEvent.serializer(), payload) }
        }
    }

    override suspend fun pruneByRetention(maxSizeMb: Long, maxAgeDays: Int) {
        val cutoffMs = nowMs() - maxAgeDays.days.inWholeMilliseconds
        val maxSizeBytes = maxSizeMb * 1_024L * 1_024L
        withContext(Dispatchers.IO) {
            mutex.withLock {
                db.argusQueries.deleteEventsOlderThan(cutoffMs)
                pruneToSizeLimit(maxSizeBytes)
            }
        }
    }

    override fun close() {
        driver.close()
    }

    private fun pruneToSizeLimit(maxSizeBytes: Long) {
        val total = db.argusQueries.totalSizeBytes().executeAsOne()
        if (total <= maxSizeBytes) return
        val rows = db.argusQueries.eventSizesAscending().executeAsList()
        val toDelete = mutableListOf<String>()
        var bytesAfter = total
        for (row in rows) {
            if (bytesAfter <= maxSizeBytes) break
            toDelete += row.id
            bytesAfter -= row.size_bytes
        }
        if (toDelete.isNotEmpty()) {
            db.argusQueries.deleteEventsByIds(toDelete)
        }
    }
}

private fun ArgusEvent.correlationIdOrNull(): String? = when (this) {
    is com.lynxal.argus.model.HttpEvent -> correlationId
    is com.lynxal.argus.model.LogEvent -> correlationId
    is com.lynxal.argus.model.CustomEvent -> null
}
