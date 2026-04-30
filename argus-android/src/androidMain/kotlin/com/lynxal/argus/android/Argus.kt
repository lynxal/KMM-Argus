@file:OptIn(ExperimentalUuidApi::class)

package com.lynxal.argus.android

import android.content.Context
import com.lynxal.argus.db.AndroidArgusDriverFactory
import com.lynxal.argus.persistence.NoopEventStore
import com.lynxal.argus.persistence.SqlDelightEventStore
import com.lynxal.argus.server.ArgusServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

public object Argus {
    public fun start(
        context: Context,
        configure: ArgusConfigBuilder.() -> Unit = {},
    ): ArgusHandle {
        val app = context.applicationContext
        val appInfo = AppInfoBuilder.from(app)
        val config = ArgusConfigBuilder(appInfo).apply(configure).build()
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
            server.start()
            handle.onStarted()
        }
        return handle
    }
}
