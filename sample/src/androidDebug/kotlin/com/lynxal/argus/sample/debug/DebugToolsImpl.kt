package com.lynxal.argus.sample.debug

import android.app.Application
import com.lynxal.argus.android.Argus
import com.lynxal.argus.android.ArgusHandle
import com.lynxal.argus.correlation.withCorrelation
import com.lynxal.argus.logging.ArgusLoggerDelegate
import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.OkHttpClient
import okhttp3.Request
import kotlin.concurrent.Volatile
import com.lynxal.argus.ktor.Argus as ArgusPlugin

/**
 * Stable event bus the capture plugins stay wired to for the whole process.
 *
 * Each `Argus.start()` builds a fresh server with a fresh bus and a fresh ring buffer, and a
 * stopped handle is spent. So the plugins can't hold an Argus bus directly — after one stop/start
 * cycle they'd still be publishing into the previous run's buffer. They publish here instead, and
 * this forwards to whichever run is current. Events published while the inspector is stopped are
 * dropped, which is the honest behaviour: there is nowhere to put them.
 */
private class SwitchableEventBus : ArgusEventBus {
    @Volatile
    var target: ArgusEventBus? = null

    override fun publish(event: ArgusEvent) {
        target?.publish(event)
    }
}

class DebugToolsImpl(private val app: Application) : DebugTools {

    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Stable bus the plugins are wired to; forwards to the current run. See [SwitchableEventBus].
     */
    private val bus = SwitchableEventBus()

    @Volatile
    private var argus: ArgusHandle? = null

    private var mirrorJob: Job? = null

    private val _url = MutableStateFlow<String?>(null)
    private val _error = MutableStateFlow<String?>(null)
    private val _running = MutableStateFlow(false)

    override fun observeArgusUrl(): StateFlow<String?> = _url.asStateFlow()

    override fun observeArgusError(): StateFlow<String?> = _error.asStateFlow()

    override fun observeArgusRunning(): StateFlow<Boolean> = _running.asStateFlow()

    /**
     * Serializes start against stop. Without it, pressing Start straight after Stop races the
     * engine still draining off the pinned port and the new run fails to bind.
     */
    private val lifecycleLock = Mutex()

    override fun startArgus() {
        if (_running.value) return
        _running.value = true // flip the button now; the bind reports itself through _url/_error
        ioScope.launch {
            lifecycleLock.withLock {
                if (argus != null) return@withLock
                val handle = Argus.start(app) {
                    port = 8787
                    maxBodyBytes = 262_144L
                }
                argus = handle
                bus.target = handle.eventBus
                // The handle's own flows die with it, so mirror them onto ours, which outlive
                // any single run.
                mirrorJob = ioScope.launch {
                    launch { handle.url.collect { _url.value = it } }
                    launch {
                        handle.startupError.collect { t ->
                            _error.value = t?.let { it.message ?: it::class.simpleName ?: "unknown error" }
                        }
                    }
                }
            }
        }
    }

    override fun stopArgus() {
        if (!_running.value) return
        _running.value = false
        _url.value = null
        _error.value = null
        ioScope.launch {
            lifecycleLock.withLock {
                val handle = argus ?: return@withLock
                argus = null
                bus.target = null
                mirrorJob?.cancel()
                mirrorJob = null
                // stop() blocks for up to ~1.1 s while the engine drains. Holding the lock across
                // it is the point: the next start waits, so the port is free by the time it binds.
                handle.stop()
            }
        }
    }

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(
                ArgusOkHttpInterceptor(
                    bus,
                    ArgusOkHttpConfig().apply { maxBodyBytes = 262_144L },
                ),
            )
            .build()
    }

    private val ktorClient: HttpClient by lazy {
        HttpClient(CIO) {
            install(ArgusPlugin) {
                eventBus = bus
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
        Logger.add(ArgusLoggerDelegate(bus))
    }

    override fun publishCustom(source: String, label: String, payload: String) {
        bus.publishCustom(
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
                val conn = ArgusUrlConnection.wrap(raw, bus, cfg)
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
