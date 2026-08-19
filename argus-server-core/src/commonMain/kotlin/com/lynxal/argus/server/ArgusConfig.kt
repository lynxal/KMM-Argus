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
 * fixed value when you want a stable URL for bookmarks or `adb forward`. If a pinned
 * port is unavailable, `start()` reports the failure through `ArgusHandle.startupError`
 * without taking the host app down — set [portFallback] to rebind on a free port instead.
 */
public data class ArgusConfig(
    val appInfo: AppInfo,
    val maxEvents: Int = 500,
    val maxBodyBytes: Long = 1_000_000L,
    val redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS,
    val corsDevOrigins: List<String> = listOf("http://localhost:5173"),
    val port: Int = 0,
    /**
     * Rebind on an OS-assigned port when the pinned [port] can't be bound. Only consulted
     * when [port] is non-zero. Off by default so a fixed-port setup never silently moves;
     * turn it on when having the inspector up matters more than the URL staying stable.
     * [ArgusServer.boundPort] and `ArgusHandle.url` always report the port actually bound.
     */
    val portFallback: Boolean = false,
    /**
     * Persist captured events to disk so a process restart doesn't erase the timeline.
     * Disabled by default; opt in via `argus { persist = true }`. The platform host
     * (currently `:argus-android`) supplies the SQLite driver factory.
     */
    val persist: Boolean = false,
    /**
     * Soft cap on persisted-event payload size in megabytes. Whichever-fires-first with
     * [persistMaxAgeDays]. The oldest events are dropped when this is exceeded.
     */
    val persistMaxSizeMb: Long = 100,
    /**
     * Soft cap on persisted-event age in days. Whichever-fires-first with
     * [persistMaxSizeMb].
     */
    val persistMaxAgeDays: Int = 7,
)
