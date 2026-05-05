package com.lynxal.argus.server.routes

import com.lynxal.argus.model.ARGUS_SCHEMA_VERSION
import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.model.ArgusJson
import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.filter.EventFilter
import com.lynxal.argus.server.protocol.InboundMessage
import com.lynxal.argus.server.protocol.OutboundMessage
import io.ktor.server.application.log
import io.ktor.server.routing.Route
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

internal fun Route.installWsRoute(buffer: EventRingBuffer, appInfo: AppInfo) {
    webSocket("/ws") {
        val log = call.application.log
        log.info("argus: /ws opened")
        send(ArgusJson.encodeToString(OutboundMessage.serializer(), OutboundMessage.Hello(appInfo, ARGUS_SCHEMA_VERSION)))

        var currentFilter: EventFilter = EventFilter()
        val sub = buffer.subscribe()
        try {
            coroutineScope {
                val outboundJob = launch { streamOutbound(this@webSocket, sub) { currentFilter } }
                for (frame in incoming) {
                    if (frame !is Frame.Text) continue
                    val text = frame.readText()
                    val msg = runCatching { ArgusJson.decodeFromString(InboundMessage.serializer(), text) }.getOrNull()
                    if (msg is InboundMessage.Subscribe) currentFilter = msg.filter
                }
                outboundJob.cancel()
            }
        } catch (cause: Throwable) {
            log.warn("argus: /ws threw ${cause::class.simpleName}: ${cause.message}", cause)
            throw cause
        } finally {
            buffer.unsubscribe(sub)
            log.info("argus: /ws handler exiting (incoming closed or scope cancelled)")
        }
    }
}

private suspend fun streamOutbound(
    session: io.ktor.server.websocket.DefaultWebSocketServerSession,
    sub: kotlinx.coroutines.channels.ReceiveChannel<OutboundMessage>,
    filter: () -> EventFilter,
) {
    for (msg in sub) {
        if (!matchesOutbound(msg, filter())) continue
        session.send(Frame.Text(ArgusJson.encodeToString(OutboundMessage.serializer(), msg)))
    }
    // Channel closes only on unsubscribe() (the WS is shutting down anyway) or buffer
    // shutdown — no need to close the session ourselves.
}

private fun matchesOutbound(msg: OutboundMessage, filter: EventFilter): Boolean = when (msg) {
    is OutboundMessage.Event -> filter.matches(msg.event)
    is OutboundMessage.Hello -> true
    OutboundMessage.Cleared -> true
}

