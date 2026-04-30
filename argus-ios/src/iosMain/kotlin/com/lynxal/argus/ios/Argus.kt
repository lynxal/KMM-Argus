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

public object Argus {
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
            server.start()
            handle.onStarted()
        }
        return handle
    }
}
