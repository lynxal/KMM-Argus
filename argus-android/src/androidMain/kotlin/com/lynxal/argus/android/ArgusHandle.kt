package com.lynxal.argus.android

import android.util.Log
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.server.ArgusServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

public class ArgusHandle internal constructor(
    private val server: ArgusServer,
    private val scope: CoroutineScope,
) {
    public val eventBus: ArgusEventBus get() = server.eventBus

    private val _url: MutableStateFlow<String?> = MutableStateFlow(null)
    public val url: StateFlow<String?> = _url.asStateFlow()

    internal fun onStarted() {
        val ip = LocalIp.firstIPv4() ?: "0.0.0.0"
        val bound = "http://$ip:${server.boundPort}"
        _url.value = bound
        Log.i(LOG_TAG, "Argus listening on $bound")
    }

    public fun stop() {
        server.stop()
        scope.cancel()
        _url.value = null
    }

    private companion object {
        const val LOG_TAG = "Argus"
    }
}
