package com.lynxal.argus.android

import android.util.Log
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.server.ArgusServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.concurrent.Volatile

/**
 * Lifecycle handle for a running Argus server. Returned from [Argus.start]; observe
 * [url] for the bound URL once the server has finished binding, wire [eventBus] into
 * your capture plugins, and call [stop] when shutting the inspector down.
 */
public class ArgusHandle internal constructor(
    private val server: ArgusServer,
    private val scope: CoroutineScope,
    private val requestedPort: Int = 0,
) {
    /**
     * The event bus the running server is reading from. Wire into your Ktor
     * `install(Argus) { eventBus = handle.eventBus }`, OkHttp `ArgusInterceptor`,
     * `ArgusLoggerDelegate`, etc., so capture flows reach the inspector.
     */
    public val eventBus: ArgusEventBus get() = server.eventBus

    private val _url: MutableStateFlow<String?> = MutableStateFlow(null)

    /**
     * Bound `http://host:port` URL once the server is listening; `null` before bind
     * completes and after [stop]. Surface in your debug UI so engineers can open the
     * inspector in a browser.
     */
    public val url: StateFlow<String?> = _url.asStateFlow()

    @Volatile
    private var stopped: Boolean = false

    private val _startupError: MutableStateFlow<Throwable?> = MutableStateFlow(null)

    /**
     * Non-null when the embedded server failed to bind on `Argus.start()`. Surface this
     * in your debug UI to alert engineers — silent failure was the prior behavior.
     */
    public val startupError: StateFlow<Throwable?> = _startupError.asStateFlow()

    // A bind that completes after stop() still lands here: server.start() is
    // non-suspending once it returns, so scope.cancel() cannot preempt the callback,
    // and stop() spends ~1.1 s draining the engine before it even gets there. Without
    // this guard a stopped handle republishes url -- breaking the "null after stop"
    // contract above, so a debug UI shows a live link to a server being torn down --
    // and logs "listening on" after teardown. That late line is also what makes the
    // Kotlin/Native test reporter throw "Received output for test that is not
    // running": the server outlives the test that started it.
    internal fun onStarted() {
        if (stopped) return
        val ip = LocalIp.firstIPv4() ?: "0.0.0.0"
        val port = server.boundPort
        val bound = "http://$ip:$port"
        _url.value = bound
        if (requestedPort != 0 && requestedPort != port) {
            Log.w(LOG_TAG, "Port $requestedPort was unavailable — Argus fell back to $port")
        }
        Log.i(LOG_TAG, "Argus listening on $bound")
    }

    internal fun onFailed(t: Throwable) {
        if (stopped) return
        _startupError.value = t
        Log.e(LOG_TAG, "Argus start failed", t)
    }

    /**
     * Stops the embedded server, cancels the supplied scope, and resets [url] and
     * [startupError] to `null`. Don't reuse a stopped handle — call [Argus.start]
     * again to get a fresh one.
     *
     * **Never throws, and safe to call at any point** — before the server has finished
     * binding, after a failed start, or twice. Argus is a debugging aid; it must not be able
     * to take the host app down on the way out. Anything that goes wrong during teardown is
     * logged and swallowed.
     *
     * Blocks the caller for up to ~1.1 s while the engine drains. Call it off the main
     * thread if that matters to you.
     */
    public fun stop() {
        if (stopped) return
        stopped = true
        _url.value = null
        _startupError.value = null
        runCatching { server.stop() }
            .onFailure { Log.w(LOG_TAG, "Argus stop failed; ignoring", it) }
        runCatching { scope.cancel() }
    }

    private companion object {
        const val LOG_TAG = "Argus"
    }
}
