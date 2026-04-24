package com.lynxal.argus.server

import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.bus.ChannelEventBus
import com.lynxal.argus.server.routes.installArgusRoutes
import io.ktor.server.cio.CIO
import io.ktor.server.cio.CIOApplicationEngine
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import kotlin.concurrent.Volatile

public actual class ArgusServer public actual constructor(private val config: ArgusConfig) {

    private val buffer: EventRingBuffer = EventRingBuffer(maxEvents = config.maxEvents)

    public actual val eventBus: ArgusEventBus = ChannelEventBus(buffer)

    private var engine: EmbeddedServer<CIOApplicationEngine, CIOApplicationEngine.Configuration>? = null

    @Volatile
    private var resolvedPort: Int = -1

    public actual val boundPort: Int
        get() = resolvedPort.takeIf { it != -1 }
            ?: error("ArgusServer.start() has not completed — boundPort is not yet available")

    public actual suspend fun start() {
        check(engine == null) { "ArgusServer.start() called twice without intervening stop()" }
        val server = embeddedServer(CIO, port = config.port) {
            installArgusRoutes(buffer, config.appInfo, config.corsDevOrigins)
        }
        engine = server
        server.start(wait = false)
        resolvedPort = server.engine.resolvedConnectors().first().port
    }

    public actual fun stop() {
        engine?.stop(gracePeriodMillis = 100, timeoutMillis = 1_000)
        engine = null
        resolvedPort = -1
        buffer.close()
    }
}
