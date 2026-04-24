package com.lynxal.argus.server.filter

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.EventSource
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.LogEvent
import com.lynxal.logging.LogLevel
import io.ktor.http.Parameters
import kotlinx.serialization.Serializable

/**
 * Shared between `GET /api/events` query parsing and the WebSocket `subscribe`
 * control message. All fields are optional; a field left `null` is ignored.
 *
 * `statusClass` uses integer buckets `1..5` mapping to `1xx..5xx` HTTP status codes.
 * `logLevel` is the enum name of [com.lynxal.logging.LogLevel] (`"Verbose"`, `"Debug"`,
 * `"Info"`, `"Warning"`, `"Error"`); invalid values degrade to a non-match rather
 * than throwing.
 */
@Serializable
public data class EventFilter(
    val source: EventSource? = null,
    val method: String? = null,
    val statusClass: Int? = null,
    val host: String? = null,
    val urlContains: String? = null,
    val logLevel: String? = null,
    val tag: String? = null,
) {

    public fun matches(event: ArgusEvent): Boolean {
        if (source != null && event.source != source) return false
        when (event) {
            is HttpEvent -> {
                if (method != null && !event.request.method.equals(method, ignoreCase = true)) return false
                if (statusClass != null) {
                    val code = event.response?.statusCode ?: return false
                    if (code / 100 != statusClass) return false
                }
                if (host != null && !event.request.host.equals(host, ignoreCase = true)) return false
                if (urlContains != null && !event.request.url.contains(urlContains, ignoreCase = true)) return false
                if (logLevel != null || tag != null) return false
            }
            is LogEvent -> {
                if (method != null || statusClass != null || host != null || urlContains != null) return false
                val logLevelName = logLevel
                if (logLevelName != null) {
                    val parsed = runCatching { LogLevel.valueOf(logLevelName) }.getOrNull() ?: return false
                    if (event.level != parsed) return false
                }
                if (tag != null && event.tag != tag) return false
            }
            else -> {
                if (method != null || statusClass != null || host != null ||
                    urlContains != null || logLevel != null || tag != null
                ) return false
            }
        }
        return true
    }

    public companion object {
        public fun fromParameters(params: Parameters): EventFilter = EventFilter(
            source = params["source"]?.let { raw ->
                runCatching { EventSource.valueOf(raw) }.getOrNull()
            },
            method = params["method"],
            statusClass = params["statusClass"]?.toIntOrNull()?.takeIf { it in 1..5 },
            host = params["host"],
            urlContains = params["urlContains"],
            logLevel = params["logLevel"],
            tag = params["tag"],
        )
    }
}
