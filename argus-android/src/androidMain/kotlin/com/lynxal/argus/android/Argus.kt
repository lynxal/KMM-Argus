@file:OptIn(ExperimentalUuidApi::class)

package com.lynxal.argus.android

import android.content.Context
import android.util.Log
import com.lynxal.argus.db.AndroidArgusDriverFactory
import com.lynxal.argus.persistence.NoopEventStore
import com.lynxal.argus.persistence.SqlDelightEventStore
import com.lynxal.argus.server.ArgusConfigBuilder
import com.lynxal.argus.server.ArgusServer
import com.lynxal.argus.server.argusConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.filterNotNull
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
        // SqlDelightEventStore opens (and migrates) the DB in its constructor. A corrupt file,
        // a full disk or a failed migration would otherwise throw straight out of the host's
        // Application.onCreate(). Losing persistence is an acceptable degradation; crashing the
        // app to protect a debug feature is not.
        val eventStore = if (config.persist) {
            runCatching { SqlDelightEventStore(AndroidArgusDriverFactory(app)) }
                .getOrElse { t ->
                    Log.w(LOG_TAG, "Argus persistence unavailable — continuing in-memory", t)
                    NoopEventStore
                }
        } else {
            NoopEventStore
        }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val server = ArgusServer(config, eventStore, sessionId)
        val handle = ArgusHandle(server, scope, config.port)
        scope.launch {
            try {
                server.start()
                handle.onStarted()
            } catch (t: Throwable) {
                handle.onFailed(t)
            }
        }
        // Failures the engine hits after a successful bind never pass through start(), so
        // they need their own route to the handle.
        scope.launch {
            server.engineError.filterNotNull().collect(handle::onFailed)
        }
        return handle
    }

    private const val LOG_TAG = "Argus"
}
