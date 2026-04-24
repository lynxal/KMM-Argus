package com.lynxal.argus.android

import android.content.Context
import com.lynxal.argus.server.ArgusServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

public object Argus {
    public fun start(
        context: Context,
        configure: ArgusConfigBuilder.() -> Unit = {},
    ): ArgusHandle {
        val appInfo = AppInfoBuilder.from(context.applicationContext)
        val config = ArgusConfigBuilder(appInfo).apply(configure).build()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val server = ArgusServer(config)
        val handle = ArgusHandle(server, scope)
        scope.launch {
            server.start()
            handle.onStarted()
        }
        return handle
    }
}
