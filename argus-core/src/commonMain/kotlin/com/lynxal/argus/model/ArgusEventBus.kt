package com.lynxal.argus.model

/**
 * Single egress point for every captured signal in Argus.
 *
 * The Ktor client plugin and the KMMLogging delegate both publish through
 * this interface; the server module consumes from the backing implementation
 * and fans events out over WebSocket.
 *
 * Real implementations (backed by a `MutableSharedFlow`) ship with the server
 * module. Consumers that don't wire Argus — release builds, unit tests that
 * don't care about capture — use [NoopEventBus].
 */
public interface ArgusEventBus {
    public fun publish(event: ArgusEvent)
}
