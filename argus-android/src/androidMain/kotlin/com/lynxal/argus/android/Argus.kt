@file:OptIn(ExperimentalUuidApi::class)

package com.lynxal.argus.android

import android.content.Context
import com.lynxal.argus.db.AndroidArgusDriverFactory
import com.lynxal.argus.persistence.NoopEventStore
import com.lynxal.argus.persistence.SqlDelightEventStore
import com.lynxal.argus.server.ArgusConfigBuilder
import com.lynxal.argus.server.ArgusServer
import com.lynxal.argus.server.argusConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Android entry point. Call [start] from your debug-only `Application.onCreate()` to
 * launch the embedded inspector server. The returned [ArgusHandle] exposes the bound
 * URL (for surfacing to engineers) and the `ArgusEventBus` (for wiring into your Ktor
 * client / log delegate). Release builds must contain zero references to this object —
 * see the README's seam-pattern + `verifyReleaseHasNoArgus` CI gate.
 */
public object Argus {
    /**
     * Configures and starts the embedded server. The server binds asynchronously on a
     * background dispatcher; observe [ArgusHandle.url] for the bound `http://host:port`
     * once binding completes (and [ArgusHandle.startupError] in case it fails).
     *
     * @param context any Android [Context]; the application context is used internally
     * for the SQLite driver factory and `AppInfo` lookup.
     * @param configure block forwarded to [ArgusConfigBuilder] for per-call tuning of
     * port, ring-buffer size, capture cap, header redaction, persistence, etc.
     * @return a new [ArgusHandle] representing the live server lifecycle.
     */
    public fun start(
        context: Context,
        configure: ArgusConfigBuilder.() -> Unit = {},
    ): ArgusHandle {
        val app = context.applicationContext
        val appInfo = AppInfoBuilder.from(app)
        val config = argusConfig(appInfo, configure)
        val sessionId = Uuid.random().toString()
        val eventStore = if (config.persist) {
            SqlDelightEventStore(AndroidArgusDriverFactory(app))
        } else {
            NoopEventStore
        }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
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
