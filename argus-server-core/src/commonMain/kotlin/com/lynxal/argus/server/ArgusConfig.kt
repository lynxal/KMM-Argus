package com.lynxal.argus.server

import com.lynxal.argus.ktor.ArgusClientConfig
import com.lynxal.argus.model.AppInfo

/**
 * Default set of HTTP header names the capture pipeline redacts.
 *
 * Single source of truth is `ArgusClientConfig.DEFAULT_REDACT_HEADERS` in `:argus-core`;
 * this re-exports it under the server-facing name the public API promises.
 */
public val DEFAULT_REDACTED_HEADERS: Set<String> = ArgusClientConfig.DEFAULT_REDACT_HEADERS

/**
 * Configuration for an [ArgusServer].
 *
 * [maxBodyBytes] and [redactHeaders] are carried here for caller convenience — they
 * are consumed by the `ArgusClientPlugin` in `:argus-core` when the caller wires
 * `server.eventBus` into the plugin config. The server itself does not re-redact or
 * re-truncate.
 *
 * [port] controls the TCP port the embedded Ktor engine binds to. `0` (default) asks
 * the OS to assign a free port; any other value pins the server to that port. Use a
 * fixed value when you want a stable URL for bookmarks or `adb forward`; note that a
 * pinned port will make `start()` fail if the port is already in use.
 */
public data class ArgusConfig(
    val appInfo: AppInfo,
    val maxEvents: Int = 500,
    val maxBodyBytes: Long = 1_000_000L,
    val redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS,
    val corsDevOrigins: List<String> = listOf("http://localhost:5173"),
    val port: Int = 0,
)
