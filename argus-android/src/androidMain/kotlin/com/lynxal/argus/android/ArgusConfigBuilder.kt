package com.lynxal.argus.android

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.server.ArgusConfig
import com.lynxal.argus.server.DEFAULT_REDACTED_HEADERS

public class ArgusConfigBuilder internal constructor(private val appInfo: AppInfo) {
    public var maxEvents: Int = 500
    public var maxBodyBytes: Long = 1_000_000L
    public var redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS
    public var corsDevOrigins: List<String> = listOf("http://localhost:5173")

    /**
     * TCP port the embedded server binds to. `0` (default) asks the OS to pick a free
     * port; any other value pins the server to that port. Use a fixed value when you
     * need a stable URL (bookmarks, `adb forward`, etc.) — be aware `start()` will
     * fail if the port is already in use.
     */
    public var port: Int = 0

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
        persist = persist,
        persistMaxSizeMb = persistMaxSizeMb,
        persistMaxAgeDays = persistMaxAgeDays,
    )
}
