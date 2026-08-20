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
import kotlinx.coroutines.cancel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicReference
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
    // One live Argus per process. Two things this closes:
    //   * start() twice used to bind a second port. With port = 0 that was merely wasteful;
    //     with a pinned port the second call reported startupError, which reads as a bug
    //     rather than "already running".
    //   * a caller that dropped its handle without stopping left the server and its
    //     SupervisorJob running unreachable. start() now hands the live handle back.
    //
    // AtomicReference, not @Volatile: the two writes here are compare-and-set, because a
    // plain check-then-act could leak the very thing this exists to prevent. Two threads
    // both seeing null would each bind a server and the second registration would overwrite
    // the first, leaving a bound and unreachable engine; and a plain
    // "if (live == stopping) live = null" could null out a newer handle's slot. A Mutex is
    // the wrong shape -- lock() suspends and start()/stop() deliberately do not, so taking
    // one would mean runBlocking on the app-init path.
    private val live: AtomicReference<ArgusHandle?> = AtomicReference(null)

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
        // Fast path: an already-running server needs no allocation at all.
        live.load()?.takeIf { !it.isStopped && !it.hasFailed }?.let { running ->
            Log.w(
                LOG_TAG,
                "Argus is already listening on ${running.url.value ?: "a port that is still binding"} — " +
                    "returning the existing handle. This start()'s configuration was IGNORED; " +
                    "call stop() first to restart with different settings.",
            )
            return running
        }

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
        val handle = ArgusHandle(
            server = server,
            scope = scope,
            requestedPort = config.port,
            onStopping = { stopping -> live.compareAndSet(stopping, null) },
        )

        // Take the slot with an atomic get-and-set. exchange() cannot fail, so there is no
        // retry and no loop: one call, one owner. The previous occupant comes back to us.
        val displaced = live.exchange(handle)
        if (displaced != null) {
            Log.w(
                LOG_TAG,
                "Displacing a previous Argus handle (" +
                    "${if (displaced.hasFailed) "failed to bind" else "already stopping"}) — " +
                    "stopping it so only one Argus server stays live",
            )
            // Whatever we displaced must not stay bound. Reaching here means either the
            // failed/stopped handle the fast path declined to reuse, or -- only when two threads
            // call start() at once -- a handle the other thread had just registered. Stopping it
            // holds the one-live-server contract in both cases, and leaves no unreachable engine.
            //
            // Its own teardown does compareAndSet(displaced, null), which now fails because the
            // slot holds our handle. That is what protects this registration.
            runCatching { displaced.stop() }
        }

        // Claimed. Only now is anything actually started.
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
