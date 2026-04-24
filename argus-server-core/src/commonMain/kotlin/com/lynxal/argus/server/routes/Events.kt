package com.lynxal.argus.server.routes

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.HttpResponse
import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.filter.EventFilter
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

internal fun Route.installEventsRoutes(buffer: EventRingBuffer) {
    get("/api/events") {
        val params = call.request.queryParameters
        val limit = params["limit"]?.toIntOrNull()?.coerceAtLeast(0)
        val before = params["before"]
        val filter = EventFilter.fromParameters(params)

        var events: List<ArgusEvent> = buffer.snapshot.value
        if (before != null) {
            val idx = events.indexOfFirst { it.id == before }
            if (idx >= 0) events = events.subList(0, idx)
        }
        events = events.filter(filter::matches)
        if (limit != null && events.size > limit) {
            events = events.takeLast(limit)
        }
        call.respond(events)
    }

    get("/api/events/{id}") {
        val id = call.parameters["id"]
        val event = buffer.snapshot.value.firstOrNull { it.id == id }
        if (event == null) call.respond(HttpStatusCode.NotFound)
        else call.respond(event)
    }

    get("/api/events/{id}/request-body") {
        val http = findHttpEvent(buffer, call.parameters["id"])
        if (http == null) {
            call.respond(HttpStatusCode.NotFound)
            return@get
        }
        respondBody(call, http.request.bodyPreview, http.request.contentType, http.request.bodyTruncatedTotalBytes)
    }

    get("/api/events/{id}/response-body") {
        val http = findHttpEvent(buffer, call.parameters["id"])
        val response: HttpResponse? = http?.response
        if (response == null) {
            call.respond(HttpStatusCode.NotFound)
            return@get
        }
        respondBody(call, response.bodyPreview, response.contentType, response.bodyTruncatedTotalBytes)
    }

    delete("/api/events") {
        buffer.clear()
        call.respond(HttpStatusCode.NoContent)
    }
}

private fun findHttpEvent(buffer: EventRingBuffer, id: String?): HttpEvent? {
    if (id == null) return null
    return buffer.snapshot.value.firstOrNull { it.id == id } as? HttpEvent
}

@OptIn(ExperimentalEncodingApi::class)
private suspend fun respondBody(
    call: io.ktor.server.application.ApplicationCall,
    bodyPreview: String?,
    contentType: String?,
    truncatedTotalBytes: Long?,
) {
    if (bodyPreview == null) {
        call.respond(HttpStatusCode.NotFound)
        return
    }
    if (truncatedTotalBytes != null) {
        call.response.headers.append("X-Argus-Truncated", truncatedTotalBytes.toString())
    }
    val parsedType = contentType?.let { runCatching { ContentType.parse(it) }.getOrNull() }
    val bytes: ByteArray = if (isTextual(parsedType)) {
        bodyPreview.encodeToByteArray()
    } else {
        runCatching { Base64.Default.decode(bodyPreview) }.getOrElse {
            // Preview was captured as UTF-8 text despite binary declared type — fall back.
            bodyPreview.encodeToByteArray()
        }
    }
    call.respondBytes(bytes, parsedType ?: ContentType.Application.OctetStream)
}

private fun isTextual(type: ContentType?): Boolean {
    if (type == null) return true
    if (type.contentType.equals("text", ignoreCase = true)) return true
    val subtype = type.contentSubtype.lowercase()
    if (type.contentType.equals("application", ignoreCase = true)) {
        return subtype == "json" || subtype == "xml" || subtype == "javascript" || subtype.endsWith("+json")
    }
    return false
}

