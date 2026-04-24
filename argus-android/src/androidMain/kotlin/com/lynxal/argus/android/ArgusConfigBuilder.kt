package com.lynxal.argus.android

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.server.ArgusConfig
import com.lynxal.argus.server.DEFAULT_REDACTED_HEADERS

public class ArgusConfigBuilder internal constructor(private val appInfo: AppInfo) {
    public var maxEvents: Int = 500
    public var maxBodyBytes: Long = 1_000_000L
    public var redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS
    public var corsDevOrigins: List<String> = listOf("http://localhost:5173")

    internal fun build(): ArgusConfig = ArgusConfig(
        appInfo = appInfo,
        maxEvents = maxEvents,
        maxBodyBytes = maxBodyBytes,
        redactHeaders = redactHeaders,
        corsDevOrigins = corsDevOrigins,
    )
}
