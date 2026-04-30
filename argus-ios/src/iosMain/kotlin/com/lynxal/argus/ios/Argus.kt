@file:OptIn(ExperimentalUuidApi::class)

package com.lynxal.argus.ios

import com.lynxal.argus.db.IosArgusDriverFactory
import com.lynxal.argus.persistence.NoopEventStore
import com.lynxal.argus.persistence.SqlDelightEventStore
import com.lynxal.argus.server.ArgusConfigBuilder
import com.lynxal.argus.server.ArgusServer
import com.lynxal.argus.server.argusConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * iOS entry point. Call [start] from your debug-only app initialization to launch the
 * embedded inspector server. The returned [ArgusHandle] exposes the bound URL (for
 * surfacing to engineers) and the `ArgusEventBus` (for wiring into your Ktor client /
 * log delegate). Release builds must contain zero references to this object — see the
 * README's split-source-set seam pattern.
 */
public object Argus {
    /**
     * Configures and starts the embedded server. The server binds asynchronously on a
     * background dispatcher; observe [ArgusHandle.url] for the bound `http://host:port`
     * once binding completes (and [ArgusHandle.startupError] in case it fails).
     *
     * SQLite-backed persistence (when enabled via `configure`) uses [IosArgusDriverFactory].
     *
     * @param configure block forwarded to [ArgusConfigBuilder] for per-call tuning of
     * port, ring-buffer size, capture cap, header redaction, persistence, etc.
     * @return a new [ArgusHandle] representing the live server lifecycle.
     */
    public fun start(
        configure: ArgusConfigBuilder.() -> Unit = {},
    ): ArgusHandle {
        val appInfo = AppInfoBuilder.build()
        val config = argusConfig(appInfo, configure)
        val sessionId = Uuid.random().toString()
        val eventStore = if (config.persist) {
            SqlDelightEventStore(IosArgusDriverFactory())
        } else {
            NoopEventStore
        }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val server = ArgusServer(config, eventStore, sessionId)
        val handle = ArgusHandle(server, scope)
        scope.launch {
            try {
                server.start()
                handle.onStarted()
            } catch (t: Throwable) {
                handle.onFailed(t)
            }
        }
        return handle
    }
}
