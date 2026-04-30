package com.lynxal.argus.server

import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.persistence.EventStore
import com.lynxal.argus.persistence.NoopEventStore

/**
 * Embedded Argus HTTP + WebSocket server.
 *
 * Construct with an [ArgusConfig], wire [eventBus] into the Ktor client plugin and
 * the KMMLogging delegate, then [start] the server. The bound port is available on
 * [boundPort] once [start] returns.
 *
 * Persistence: pass a non-[NoopEventStore] [eventStore] together with a [sessionId]
 * (typically a fresh UUID per process) and the previous run's events as [seed] to
 * survive process restarts. Hosts that don't enable persistence keep the defaults
 * and behave identically to Phase 1.
 *
 * Platform actuals:
 * - JVM + Android → Ktor CIO engine (`jvmAndAndroidMain/ArgusServer.kt`).
 * - iOS → Ktor CIO engine on native (`iosMain/ArgusServer.kt`).
 */
public expect class ArgusServer(
    config: ArgusConfig,
    eventStore: EventStore = NoopEventStore,
    sessionId: String = NoopEventStore.NO_SESSION,
) {

    public val eventBus: ArgusEventBus

    /**
     * Port the embedded engine is bound to. Valid only after [start] returns.
     * Accessing this before [start] has completed throws [IllegalStateException].
     */
    public val boundPort: Int

    /**
     * Starts the server and suspends until the socket is bound. After resumption
     * [boundPort] returns the OS-assigned port.
     */
    public suspend fun start()

    public fun stop()
}
