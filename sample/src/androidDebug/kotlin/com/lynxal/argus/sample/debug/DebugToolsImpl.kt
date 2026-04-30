package com.lynxal.argus.sample.debug

import android.app.Application
import com.lynxal.argus.android.Argus
import com.lynxal.argus.android.ArgusHandle
import com.lynxal.argus.correlation.withCorrelation
import com.lynxal.argus.logging.ArgusLoggerDelegate
import com.lynxal.argus.model.Direction
import com.lynxal.argus.model.publishCustom
import com.lynxal.argus.okhttp.ArgusOkHttpConfig
import com.lynxal.argus.okhttp.ArgusOkHttpInterceptor
import com.lynxal.argus.urlconnection.ArgusUrlConnection
import com.lynxal.argus.urlconnection.ArgusUrlConnectionConfig
import com.lynxal.logging.DebugLoggerImplementation
import com.lynxal.logging.LogLevel
import com.lynxal.logging.Logger
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.serialization.kotlinx.json.json
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import com.lynxal.argus.ktor.Argus as ArgusPlugin

class DebugToolsImpl(private val app: Application) : DebugTools {
    private val argus: ArgusHandle = Argus.start(app) {
        port = 8787
        maxBodyBytes = 262_144L
    }

    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(
                ArgusOkHttpInterceptor(
                    argus.eventBus,
                    ArgusOkHttpConfig().apply { maxBodyBytes = 262_144L },
                ),
            )
            .build()
    }

    private val ktorClient: HttpClient by lazy {
        HttpClient(CIO) {
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
        ioScope.launch {
            runCatching {
                okHttpClient.newCall(Request.Builder().url(url).build()).execute().use {
                    it.body?.string()
                }
            }
        }
    }

    override fun fireUrlConnectionCall(url: String) {
        ioScope.launch {
            runCatching {
                val raw = URL(url).openConnection() as HttpURLConnection
                val cfg = ArgusUrlConnectionConfig().apply { maxBodyBytes = 262_144L }
                val conn = ArgusUrlConnection.wrap(raw, argus.eventBus, cfg)
                try {
                    conn.connect()
                    conn.inputStream.use { it.readBytes() }
                } finally {
                    conn.disconnect()
                }
            }
        }
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
