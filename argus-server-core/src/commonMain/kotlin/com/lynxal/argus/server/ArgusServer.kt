package com.lynxal.argus.server

import com.lynxal.argus.model.ArgusEventBus

/**
 * Embedded Argus HTTP + WebSocket server.
 *
 * Construct with an [ArgusConfig], wire [eventBus] into the Ktor client plugin and
 * the KMMLogging delegate, then [start] the server. The bound port is available on
 * [boundPort] once [start] returns.
 *
 * Platform actuals:
 * - JVM + Android → Ktor CIO engine (`jvmAndAndroidMain/ArgusServer.kt`).
 * - iOS → Ktor CIO engine on native (`iosMain/ArgusServer.kt`).
 */
public expect class ArgusServer(config: ArgusConfig) {

    public val eventBus: ArgusEventBus

    /**
     * Port the embedded engine is bound to. Valid only after [start] returns.
     * Accessing this before [start] has completed throws [IllegalStateException].
     */
    public val boundPort: Int

    /**
     * Starts the server and suspends until the socket is bound. After resumption
     * [boundPort] returns the OS-assigned port.
     *
     * Deviates from a non-suspend signature because the underlying Ktor engine's
     * `resolvedConnectors()` is itself suspend on both JVM and Native CIO, and a
     * non-suspend start would either block the caller (`runBlocking`) or return
     * before the port is known.
     */
    public suspend fun start()

    public fun stop()
}
