package com.lynxal.argus.sample.debug

import com.lynxal.argus.correlation.withCorrelation
import com.lynxal.argus.ios.Argus
import com.lynxal.argus.ios.ArgusHandle
import com.lynxal.argus.logging.ArgusLoggerDelegate
import com.lynxal.argus.model.Direction
import com.lynxal.argus.model.publishCustom
import com.lynxal.logging.DebugLoggerImplementation
import com.lynxal.logging.LogLevel
import com.lynxal.logging.Logger
import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import com.lynxal.argus.ktor.Argus as ArgusPlugin

class DebugToolsImpl : DebugTools {
    private val argus: ArgusHandle = Argus.start {
        port = 8787
        maxBodyBytes = 262_144L
    }
    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val ktorClient: HttpClient by lazy {
        HttpClient(Darwin) {
            install(ArgusPlugin) {
                eventBus = argus.eventBus
                maxBodyBytes = 262_144L
            }
            install(ContentNegotiation) {
                json()
            }
        }
    }

    override fun buildHttpClient(): HttpClient = ktorClient

    override fun installLogging() {
        Logger.minLevel = LogLevel.Verbose
        Logger.add(DebugLoggerImplementation())
        Logger.add(ArgusLoggerDelegate(argus.eventBus))
    }

    override fun observeArgusUrl(): StateFlow<String?> = argus.url

    override fun publishCustom(source: String, label: String, payload: String) {
        argus.eventBus.publishCustom(
            source = source,
            label = label,
            direction = Direction.NONE,
            payload = payload,
        )
    }

    override fun fireOkHttpCall(url: String) {
        // OkHttp engine is JVM-only; no iOS counterpart.
    }

    override fun fireUrlConnectionCall(url: String) {
        // HttpURLConnection is JVM-only; no iOS counterpart.
    }

    override fun fireCorrelatedPair(first: String, second: String) {
        ioScope.launch {
            withCorrelation {
                val logger = Logger.tag("Argus sample")
                logger.info { message = "correlated-pair: starting" }
                runCatching { ktorClient.get(first) }
                logger.info { message = "correlated-pair: first done, firing second" }
                runCatching { ktorClient.get(second) }
                logger.info { message = "correlated-pair: done" }
            }
        }
    }
}
