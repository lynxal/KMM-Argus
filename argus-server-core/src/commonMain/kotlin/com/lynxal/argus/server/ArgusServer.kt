package com.lynxal.argus.server

import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.persistence.EventStore
import com.lynxal.argus.persistence.NoopEventStore
import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.bus.ChannelEventBus
import com.lynxal.argus.server.routes.installArgusRoutes
import io.ktor.server.cio.CIO
import io.ktor.server.cio.CIOApplicationEngine
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import kotlin.concurrent.Volatile

/**
 * Embedded Argus HTTP + WebSocket server.
 *
 * Construct with an [ArgusConfig], wire [eventBus] into the Ktor client plugin and
 * the KMMLogging delegate, then [start] the server. The bound port is available on
 * [boundPort] once [start] returns.
 *
 * Persistence: pass a non-[NoopEventStore] [eventStore] together with a [sessionId]
 * (typically a fresh UUID per process) and the previous run's events as [seed] to
 * survive process restarts. Hosts that don't enable persistence keep the in-memory
 * defaults.
 *
 * The Ktor CIO engine is multiplatform (JVM, Android, iOS), so the implementation
 * lives in `commonMain` with no expect/actual split.
 */
public class ArgusServer(
    private val config: ArgusConfig,
    private val eventStore: EventStore = NoopEventStore,
    private val sessionId: String = NoopEventStore.NO_SESSION,
) {

    private val buffer: EventRingBuffer = EventRingBuffer(
        maxEvents = config.maxEvents,
        eventStore = eventStore,
        sessionId = sessionId,
        persistMaxSizeMb = config.persistMaxSizeMb,
        persistMaxAgeDays = config.persistMaxAgeDays,
    )

    public val eventBus: ArgusEventBus = ChannelEventBus(buffer)

    private var engine: EmbeddedServer<CIOApplicationEngine, CIOApplicationEngine.Configuration>? = null

    @Volatile
    private var resolvedPort: Int = -1

    /**
     * Port the embedded engine is bound to. Valid only after [start] returns.
     * Accessing this before [start] has completed throws [IllegalStateException].
     */
    public val boundPort: Int
        get() = resolvedPort.takeIf { it != -1 }
            ?: error("ArgusServer.start() has not completed — boundPort is not yet available")

    /**
     * Starts the server and suspends until the socket is bound. After resumption
     * [boundPort] returns the OS-assigned port.
     */
    public suspend fun start() {
        check(engine == null) { "ArgusServer.start() called twice without intervening stop()" }
        if (eventStore !== NoopEventStore) {
            val seed = runCatching {
                eventStore.previousSessionEvents(sessionId, config.maxEvents)
            }.getOrDefault(emptyList())
            buffer.hydrate(seed)
        }
        val server = embeddedServer(CIO, port = config.port) {
            installArgusRoutes(buffer, config.appInfo, config.corsDevOrigins)
        }
        engine = server
        server.start(wait = false)
        resolvedPort = server.engine.resolvedConnectors().first().port
    }

    public fun stop() {
        engine?.stop(gracePeriodMillis = 100, timeoutMillis = 1_000)
        engine = null
        resolvedPort = -1
        buffer.close()
        if (eventStore !== NoopEventStore) eventStore.close()
    }
}
