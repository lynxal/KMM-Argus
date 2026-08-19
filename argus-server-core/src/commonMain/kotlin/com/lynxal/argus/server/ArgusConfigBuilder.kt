package com.lynxal.argus.server

import com.lynxal.argus.model.AppInfo

/**
 * DSL builder for [ArgusConfig]. Hosts construct an [AppInfo] from platform APIs and
 * pass it into a builder; consumers tweak knobs via the public `var`s and call [build].
 *
 * The builder lives in `argus-server-core/commonMain` so both the Android facade
 * (`:argus-android`) and the iOS facade (`:argus-ios`) share the same surface — no
 * drift between platforms.
 */
public class ArgusConfigBuilder internal constructor(private val appInfo: AppInfo) {
    public var maxEvents: Int = 500
    public var maxBodyBytes: Long = 1_000_000L
    public var redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS
    public var corsDevOrigins: List<String> = listOf("http://localhost:5173")

    /**
     * TCP port the embedded server binds to. `0` (default) asks the OS to pick a free
     * port; any other value pins the server to that port. Use a fixed value when you
     * need a stable URL (bookmarks, `adb forward`, etc.). An unavailable pinned port
     * surfaces on `ArgusHandle.startupError` instead of crashing the host app; see
     * [portFallback] to rebind on a free port instead.
     */
    public var port: Int = 0

    /** Rebind on a free port when the pinned [port] is taken. See [ArgusConfig.portFallback]. */
    public var portFallback: Boolean = false

    /** Persist events across app restarts. See [ArgusConfig.persist]. */
    public var persist: Boolean = false
    public var persistMaxSizeMb: Long = 100
    public var persistMaxAgeDays: Int = 7

    internal fun build(): ArgusConfig = ArgusConfig(
        appInfo = appInfo,
        maxEvents = maxEvents,
        maxBodyBytes = maxBodyBytes,
        redactHeaders = redactHeaders,
        corsDevOrigins = corsDevOrigins,
        port = port,
        portFallback = portFallback,
        persist = persist,
        persistMaxSizeMb = persistMaxSizeMb,
        persistMaxAgeDays = persistMaxAgeDays,
    )
}

/**
 * Bridge entry point used by host facades (`:argus-android`, `:argus-ios`) to
 * construct an [ArgusConfig] from an [AppInfo] and a configure-lambda. The
 * builder's constructor and [ArgusConfigBuilder.build] are `internal` to
 * `:argus-server-core`, so this is the only way to obtain a configured
 * `ArgusConfig` from outside the module.
 */
public fun argusConfig(
    appInfo: AppInfo,
    configure: ArgusConfigBuilder.() -> Unit = {},
): ArgusConfig = ArgusConfigBuilder(appInfo).apply(configure).build()
