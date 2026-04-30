package com.lynxal.argus.persistence

import com.lynxal.argus.model.ArgusEvent

/**
 * Persistent backing store for [ArgusEvent]s.
 *
 * Implementations are expected to be safe to call from any thread. The contract is
 * "best-effort durable" — a dropped insert (e.g. due to disk pressure) is logged but
 * never raised back to the publisher; the in-memory ring buffer remains the source of
 * truth for live events.
 *
 * The default implementation, [NoopEventStore], is wired in when persistence is
 * disabled (`ArgusConfig.persist = false`); SQLDelight-backed durability is provided
 * by [SqlDelightEventStore].
 */
public interface EventStore {
    /** Persist [event] under [sessionId]. [sizeBytes] feeds the size-based retention check. */
    public suspend fun append(event: ArgusEvent, sessionId: String, sizeBytes: Long)

    /**
     * Events from the most recent session that is *not* [currentSessionId], ordered
     * oldest-first, capped at [maxEvents]. Used to rehydrate the in-memory ring buffer
     * at startup so a process restart doesn't erase the timeline.
     */
    public suspend fun previousSessionEvents(currentSessionId: String, maxEvents: Int): List<ArgusEvent>

    /** Apply the configured retention policy. Idempotent; cheap to call frequently. */
    public suspend fun pruneByRetention(maxSizeMb: Long, maxAgeDays: Int)

    /** Release any held resources. After [close] no further calls are permitted. */
    public fun close()
}
