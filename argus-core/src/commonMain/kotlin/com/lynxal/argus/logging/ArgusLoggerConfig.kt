package com.lynxal.argus.logging

import com.lynxal.logging.LogLevel

/**
 * Tuning knobs for [ArgusLoggerDelegate]. Defaults are generous for debug sessions;
 * tighten them when the event bus is feeding a constrained sink (e.g., WebSocket on
 * a spotty IoT network) or when a single call site is known to log large payloads.
 *
 * [minLevel] is a delegate-local filter applied *in addition to* KMMLogging's
 * global `Logger.minLevel`. The dispatcher already drops anything below the global
 * threshold before the delegate is invoked, so this field only matters when Argus
 * should be *stricter* than the global logger — e.g., logcat at `Verbose` for
 * development convenience while Argus only captures `Info+` to keep the bus quiet.
 * Default `Verbose` = pass-through.
 */
public data class ArgusLoggerConfig(
    public val minLevel: LogLevel = LogLevel.Verbose,
    public val maxMessageLength: Int = 10_000,
    public val maxPayloadEntries: Int = 50,
    public val captureStackTraces: Boolean = true,
)
