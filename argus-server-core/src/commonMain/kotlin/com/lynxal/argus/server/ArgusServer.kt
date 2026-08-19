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
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    @Volatile
    private var engine: EmbeddedServer<CIOApplicationEngine, CIOApplicationEngine.Configuration>? = null

    @Volatile
    private var resolvedPort: Int = -1

    @Volatile
    private var stopped: Boolean = false

    private val _engineError: MutableStateFlow<Throwable?> = MutableStateFlow(null)

    /**
     * Non-null once the embedded engine fails *after* it has bound successfully — a dead
     * accept loop, for instance. Startup failures are not reported here; those are thrown
     * out of [start] so the caller can react to them directly.
     *
     * Ktor's CIO engine runs the bind and the accept loop in coroutines of its own. Without
     * a handler in their context, a throw there reaches the platform's uncaught-exception
     * handler, which terminates the host app. This flow is where those failures land instead.
     */
    public val engineError: StateFlow<Throwable?> = _engineError.asStateFlow()

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
     *
     * Throws if the socket can't be bound. When [ArgusConfig.port] is pinned and
     * [ArgusConfig.portFallback] is on, an unavailable port is retried once on an
     * OS-assigned port before giving up.
     */
    public suspend fun start() {
        check(engine == null) { "ArgusServer.start() called twice without intervening stop()" }
        // stop() closes the ring buffer and the event store for good — both are single-use.
        // Without this guard the engine rebinds happily and serves a server that can never
        // receive another event, which is worse than failing.
        check(!stopped) { "ArgusServer has been stopped — construct a new instance to start again" }
        if (eventStore !== NoopEventStore) {
            val seed = runCatching {
                eventStore.previousSessionEvents(sessionId, config.maxEvents)
            }.getOrDefault(emptyList())
            buffer.hydrate(seed)
        }
        val pinned = config.port
        try {
            bind(pinned)
        } catch (primary: Throwable) {
            if (pinned == 0 || !config.portFallback) throw primary
            try {
                bind(ANY_PORT)
            } catch (fallback: Throwable) {
                primary.addSuppressed(fallback)
                throw primary
            }
        }
    }

    /**
     * Stops the engine and releases the ring buffer and event store. **Never throws** — Argus
     * is a debugging aid and must not be able to take the host app down on the way out, so
     * every teardown step is isolated and a failure in one doesn't skip the others.
     *
     * Idempotent: calling it again, or before [start], does nothing. The instance is terminal
     * afterwards — construct a new [ArgusServer] to run again.
     *
     * Blocks the calling thread for up to ~1.1 s while the engine drains in-flight requests.
     * Prefer [stopSuspend] anywhere you can suspend.
     */
    public fun stop() {
        if (stopped) return
        stopped = true
        val toStop = engine
        engine = null
        resolvedPort = -1
        _engineError.value = null
        runCatching { toStop?.stop(gracePeriodMillis = STOP_GRACE_MS, timeoutMillis = STOP_TIMEOUT_MS) }
        runCatching { buffer.close() }
        if (eventStore !== NoopEventStore) runCatching { eventStore.close() }
    }

    /**
     * [stop] without blocking the caller's thread. Same guarantees: never throws, idempotent,
     * terminal. Suspends until the socket is released, so the port is free once it returns.
     */
    public suspend fun stopSuspend() {
        if (stopped) return
        stopped = true
        val toStop = engine
        engine = null
        resolvedPort = -1
        _engineError.value = null
        runCatching { toStop?.stopSuspend(gracePeriodMillis = STOP_GRACE_MS, timeoutMillis = STOP_TIMEOUT_MS) }
        runCatching { buffer.close() }
        if (eventStore !== NoopEventStore) runCatching { eventStore.close() }
    }

    /**
     * One bind attempt. Leaves [engine] and [resolvedPort] untouched unless the socket is
     * actually bound, so a failed attempt can be retried on another port and doesn't trip
     * the "called twice" guard in [start].
     */
    private suspend fun bind(port: Int) {
        val sink = EngineFailureSink { cause -> _engineError.value = cause }
        val server = buildEngine(port, sink)
        try {
            server.start(wait = false)
            resolvedPort = server.engine.resolvedConnectors().firstOrNull()?.port
                ?: error("Argus server started but resolved no connector (requested port $port)")
            engine = server
            sink.live = true
        } catch (cause: Throwable) {
            runCatching { server.stopSuspend(gracePeriodMillis = 0, timeoutMillis = 0) }
            resolvedPort = -1
            engine = null
            throw cause
        }
    }

    private fun buildEngine(
        port: Int,
        sink: EngineFailureSink,
    ): EmbeddedServer<CIOApplicationEngine, CIOApplicationEngine.Configuration> {
        // The CoroutineExceptionHandler is the fix. CIO runs bind() and the accept loop in
        // coroutines parented off this context; without a handler here the throwable reaches
        // the platform's global handler, which kills the host app (BindException on the JVM,
        // EADDRINUSE PosixException on Kotlin/Native). Verified both ways by
        // ArgusServerBindTest and argus-ios's ArgusPortConflictTest.
        //
        // SupervisorJob is for isolation, not interception: Ktor also parents the Application's
        // own scope off this context, and a plain Job would let an engine failure cancel it.
        val engineScope = CoroutineScope(
            SupervisorJob() + CoroutineExceptionHandler { _, cause -> sink.report(cause) },
        )
        return engineScope.embeddedServer(CIO, port = port) {
            installArgusRoutes(buffer, config.appInfo, config.corsDevOrigins)
        }
    }

    /**
     * Failure sink for one bind attempt. [live] gates reporting until the attempt has
     * actually bound: a startup failure already propagates out of [start], and promoting it
     * here as well would leave a stale error behind after a successful fallback rebind.
     */
    private class EngineFailureSink(private val promote: (Throwable) -> Unit) {
        @Volatile
        var live: Boolean = false

        fun report(cause: Throwable) {
            if (live) promote(cause)
        }
    }

    private companion object {
        /** Ask the OS for a free port. */
        const val ANY_PORT = 0
        const val STOP_GRACE_MS = 100L
        const val STOP_TIMEOUT_MS = 1_000L
    }
}
