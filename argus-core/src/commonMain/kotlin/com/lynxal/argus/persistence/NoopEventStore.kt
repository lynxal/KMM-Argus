package com.lynxal.argus.persistence

import com.lynxal.argus.model.ArgusEvent

/**
 * Zero-cost [EventStore] used when persistence is disabled. Mirrors
 * [com.lynxal.argus.model.NoopEventBus] so the ring buffer can hold a non-null reference
 * regardless of [com.lynxal.argus.server.ArgusConfig.persist].
 */
public object NoopEventStore : EventStore {
    override suspend fun append(event: ArgusEvent, sessionId: String, sizeBytes: Long) = Unit
    override suspend fun previousSessionEvents(currentSessionId: String, maxEvents: Int): List<ArgusEvent> = emptyList()
    override suspend fun pruneByRetention(maxSizeMb: Long, maxAgeDays: Int) = Unit
    override fun close() = Unit

    public const val NO_SESSION: String = "argus-noop"
}
