package com.lynxal.argus.capture

@InternalArgusApi
public data class CaptureConfig(
    val maxBodyBytes: Long,
    val fullBodyHosts: Set<String>,
    val redactHeaders: Set<String>,
    val captureRequestBody: Boolean,
    val captureResponseBody: Boolean,
)

@InternalArgusApi
public fun effectiveMaxBytesFor(host: String, cfg: CaptureConfig): Long {
    if (cfg.fullBodyHosts.isEmpty()) return cfg.maxBodyBytes
    val match = cfg.fullBodyHosts.any { it.equals(host, ignoreCase = true) }
    // Clamp to Int.MAX_VALUE: captured bodies live in a single ByteArray, which
    // is Int-sized. Returning Long.MAX_VALUE would silently truncate at ~2 GB
    // without `truncatedTotalBytes` reflecting the cap.
    return if (match) Int.MAX_VALUE.toLong() else cfg.maxBodyBytes
}
