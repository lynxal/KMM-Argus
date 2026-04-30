package com.lynxal.argus.logging

import com.lynxal.argus.correlation.CorrelationThreadLocal
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.LogEvent
import com.lynxal.argus.model.toThrowableInfo
import com.lynxal.logging.LogDetails
import com.lynxal.logging.LoggerExtras
import com.lynxal.logging.LoggerImplementation
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * KMMLogging [LoggerImplementation] that forwards every application log call into
 * the Argus event stream, where the unified HTTP + log timeline can consume it.
 *
 * Register at app bootstrap (debug builds only):
 * ```
 * Logger.add(ArgusLoggerDelegate(argusServer.eventBus))
 * ```
 *
 * The dispatcher already filters by `Logger.minLevel` before calling [log], so the
 * delegate receives only events that passed the global threshold. [ArgusLoggerConfig.minLevel]
 * adds a *stricter* per-delegate filter on top of that, defaulting to `Verbose` (no extra
 * filtering).
 *
 * If the call site is wrapped in `withCorrelation { ... }`, the active correlation id is
 * stamped on the emitted [LogEvent] so the inspector can pair it with the matching
 * `HttpEvent`. The id is propagated to the synchronous `log` callback via a thread-local
 * bridge installed by [com.lynxal.argus.correlation.ArgusCorrelationId.updateThreadContext].
 *
 * @see LoggerImplementation the single-method KMMLogging contract
 * @see ArgusEventBus the publish sink; pass [com.lynxal.argus.model.NoopEventBus] in
 *   release paths and the delegate becomes a zero-cost sink.
 */
@OptIn(ExperimentalUuidApi::class)
public class ArgusLoggerDelegate(
    private val bus: ArgusEventBus,
    private val config: ArgusLoggerConfig = ArgusLoggerConfig(),
) : LoggerImplementation {

    override fun log(logDetails: LogDetails, loggerExtras: LoggerExtras) {
        if (logDetails.logLevel.level < config.minLevel.level) return

        bus.publish(
            LogEvent(
                id = Uuid.random().toString(),
                timestamp = logDetails.timestamp.toEpochMilliseconds(),
                level = logDetails.logLevel,
                tag = loggerExtras.tag.ifBlank { null },
                message = truncate(logDetails.message),
                payload = capPayload(logDetails.payload),
                throwable = logDetails.cause?.toThrowableInfo(config.captureStackTraces),
                correlationId = CorrelationThreadLocal.get(),
            )
        )
    }

    private fun truncate(s: String): String {
        val max = config.maxMessageLength
        return if (s.length <= max) s else s.substring(0, max) + "...<+${s.length - max} chars>"
    }

    private fun capPayload(m: Map<String, String>): Map<String, String> {
        val max = config.maxPayloadEntries
        return if (m.size <= max) m else m.entries.take(max).associate { it.key to it.value }
    }
}
