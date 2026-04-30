package com.lynxal.argus.server.routes

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.model.ArgusJson
import com.lynxal.argus.server.buffer.EventRingBuffer
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets

/**
 * Installs every Argus feature and route onto [Application].
 *
 * Owns feature installation (`ContentNegotiation`, `WebSockets`, `CORS`) because the
 * server module controls the whole [Application] in v1. Do not call this function on
 * an `Application` that already installs any of these features — it will fail at
 * install-time.
 *
 * [corsOrigins] is honored verbatim: an empty list skips CORS entirely; non-empty
 * entries are parsed as `http://host[:port]` or `https://host[:port]` and allowed.
 */
public fun Application.installArgusRoutes(
    buffer: EventRingBuffer,
    appInfo: AppInfo,
    corsOrigins: List<String>,
) {
    install(ContentNegotiation) { json(ArgusJson) }
    install(WebSockets)
    if (corsOrigins.isNotEmpty()) {
        install(CORS) {
            for (origin in corsOrigins) {
                val (scheme, hostPort) = when {
                    origin.startsWith("http://") -> "http" to origin.removePrefix("http://")
                    origin.startsWith("https://") -> "https" to origin.removePrefix("https://")
                    else -> continue
                }
                allowHost(hostPort, schemes = listOf(scheme))
            }
            allowMethod(HttpMethod.Delete)
            allowHeader(HttpHeaders.ContentType)
        }
    }

    routing {
        installInfoRoute(appInfo)
        installEventsRoutes(buffer)
        installWsRoute(buffer, appInfo)
        installUiRoutes()
    }
}
