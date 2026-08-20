package com.lynxal.argus.ios

import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.server.ArgusServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.Foundation.NSLog
import kotlin.concurrent.Volatile

/**
 * Lifecycle handle for a running Argus server on iOS. Returned from [Argus.start];
 * observe [url] for the bound URL once the server has finished binding, wire
 * [eventBus] into your capture plugins, and call [stop] when shutting the inspector
 * down.
 */
public class ArgusHandle internal constructor(
    private val server: ArgusServer,
    private val scope: CoroutineScope,
    private val requestedPort: Int = 0,
    // Invoked as teardown *begins*, before the engine drains. Argus drops its live
    // reference here rather than at the end of stop(): the drain is bounded at ~1.1 s
    // (measured 30-120 ms in practice), and a start() landing in that window must build a
    // fresh handle instead of being handed this dying one. Receives `this` so Argus only clears the slot if it still owns it -- an
    // outgoing handle finishing its drain must not null out a newer handle's registration.
    private val onStopping: (ArgusHandle) -> Unit = {},
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

    /** True once [stop] has begun. A stopped handle is terminal — never reused. */
    internal val isStopped: Boolean get() = stopped

    /** True when the bind failed. Argus replaces a failed handle rather than handing it back. */
    internal val hasFailed: Boolean get() = _startupError.value != null

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
            NSLog("[Argus] port $requestedPort was unavailable — fell back to $port")
        }
        NSLog("[Argus] listening on $bound")
    }

    internal fun onFailed(t: Throwable) {
        if (stopped) return
        _startupError.value = t
        NSLog("[Argus] start failed: ${t.message ?: t::class.simpleName ?: "unknown"}")
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
        // Before the drain, not after — see onStopping.
        runCatching { onStopping(this) }
            .onFailure { NSLog("[Argus] stop hook failed, ignoring: ${it.message ?: it::class.simpleName}") }
        _url.value = null
        _startupError.value = null
        runCatching { server.stop() }
            .onFailure { NSLog("[Argus] stop failed, ignoring: ${it.message ?: it::class.simpleName}") }
        runCatching { scope.cancel() }
    }
}
