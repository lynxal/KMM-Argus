package com.lynxal.argus.android

import android.util.Log
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.server.ArgusServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Lifecycle handle for a running Argus server. Returned from [Argus.start]; observe
 * [url] for the bound URL once the server has finished binding, wire [eventBus] into
 * your capture plugins, and call [stop] when shutting the inspector down.
 */
public class ArgusHandle internal constructor(
    private val server: ArgusServer,
    private val scope: CoroutineScope,
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

    private val _startupError: MutableStateFlow<Throwable?> = MutableStateFlow(null)

    /**
     * Non-null when the embedded server failed to bind on `Argus.start()`. Surface this
     * in your debug UI to alert engineers — silent failure was the prior behavior.
     */
    public val startupError: StateFlow<Throwable?> = _startupError.asStateFlow()

    internal fun onStarted() {
        val ip = LocalIp.firstIPv4() ?: "0.0.0.0"
        val bound = "http://$ip:${server.boundPort}"
        _url.value = bound
        Log.i(LOG_TAG, "Argus listening on $bound")
    }

    internal fun onFailed(t: Throwable) {
        _startupError.value = t
        Log.e(LOG_TAG, "Argus start failed", t)
    }

    /**
     * Stops the embedded server, cancels the supplied scope, and resets [url] and
     * [startupError] to `null`. Don't reuse a stopped handle — call [Argus.start]
     * again to get a fresh one.
     */
    public fun stop() {
        server.stop()
        scope.cancel()
        _url.value = null
        _startupError.value = null
    }

    private companion object {
        const val LOG_TAG = "Argus"
    }
}
