package com.lynxal.argus.server.routes

import com.lynxal.argus.webui.ArgusUiBundle
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

internal fun Route.installUiRoutes() {
    get("/") {
        val entry = ArgusUiBundle.get("/index.html")
        if (entry == null) {
            call.respond(HttpStatusCode.NotFound)
            return@get
        }
        call.respondBytes(entry.bytes, ContentType.parse(entry.contentType))
    }

    get("/{path...}") {
        val segments = call.parameters.getAll("path").orEmpty()
        val raw = "/" + segments.joinToString("/")
        // /api and /ws are claimed by installEventsRoutes / installWsRoute — 404 rather than SPA fallback.
        if (raw == "/api" || raw.startsWith("/api/") || raw == "/ws" || raw.startsWith("/ws/")) {
            call.respond(HttpStatusCode.NotFound)
            return@get
        }
        val entry = ArgusUiBundle.get(raw) ?: ArgusUiBundle.get("/index.html")
        if (entry == null) {
            call.respond(HttpStatusCode.NotFound)
            return@get
        }
        call.respondBytes(entry.bytes, ContentType.parse(entry.contentType))
    }
}
