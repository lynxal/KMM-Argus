package com.lynxal.argus.server.routes

import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.createTestAppInfo
import com.lynxal.argus.server.createTestEventFilter
import com.lynxal.argus.server.createTestHttpEvent
import com.lynxal.argus.server.createTestLogEvent
import com.lynxal.argus.server.protocol.InboundMessage
import com.lynxal.argus.server.protocol.OutboundMessage
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.delete
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

class WsTest {

    private val json = Json {
        classDiscriminator = "type"
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    @Test
    fun `first frame is hello with schema version and app info`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        val wsClient = createClient { install(WebSockets) }

        wsClient.webSocket("/ws") {
            val msg = readMessage(this)
            assertTrue(msg is OutboundMessage.Hello)
            assertEquals(1, msg.schemaVersion)
            assertEquals("com.example.canvas", msg.info.pkg)
        }
    }

    @Test
    fun `publishing event after connect delivers event frame`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        val wsClient = createClient { install(WebSockets) }

        wsClient.webSocket("/ws") {
            readHello(this)
            buffer.offer(createTestHttpEvent(id = "live-1"))
            val msg = readMessage(this)
            assertTrue(msg is OutboundMessage.Event)
            assertEquals("live-1", msg.event.id)
        }
    }

    @Test
    fun `DELETE api events delivers cleared frame`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        val wsClient = createClient { install(WebSockets) }

        wsClient.webSocket("/ws") {
            readHello(this)
            buffer.offer(createTestHttpEvent(id = "seed"))
            assertTrue(readMessage(this) is OutboundMessage.Event)

            coroutineScope {
                val next = async { readMessage(this@webSocket) }
                launch { wsClient.delete("/api/events") }
                assertEquals(OutboundMessage.Cleared, next.await())
            }
        }
    }

    @Test
    fun `subscribe filter limits subsequent events`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        val wsClient = createClient { install(WebSockets) }

        wsClient.webSocket("/ws") {
            readHello(this)
            val subscribe: InboundMessage = InboundMessage.Subscribe(createTestEventFilter(method = "GET"))
            send(Frame.Text(json.encodeToString(InboundMessage.serializer(), subscribe)))
            // Give the server a moment to apply the filter before we publish.
            delay(50)

            buffer.offer(createTestLogEvent(id = "dropped"))
            buffer.offer(createTestHttpEvent(id = "kept"))

            val msg = readMessage(this)
            assertTrue(msg is OutboundMessage.Event)
            assertEquals("kept", msg.event.id)
        }
    }

    @Test
    fun `two concurrent sockets receive same event`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        val wsClient = createClient { install(WebSockets) }

        coroutineScope {
            val resultA = async {
                var id: String? = null
                wsClient.webSocket("/ws") {
                    readHello(this)
                    val msg = readMessage(this) as OutboundMessage.Event
                    id = msg.event.id
                }
                id
            }
            val resultB = async {
                var id: String? = null
                wsClient.webSocket("/ws") {
                    readHello(this)
                    val msg = readMessage(this) as OutboundMessage.Event
                    id = msg.event.id
                }
                id
            }
            delay(100)
            buffer.offer(createTestHttpEvent(id = "broadcast"))
            assertEquals("broadcast", resultA.await())
            assertEquals("broadcast", resultB.await())
        }
    }

    private suspend fun readHello(session: DefaultClientWebSocketSession) {
        assertTrue(readMessage(session) is OutboundMessage.Hello)
    }

    private suspend fun readMessage(session: DefaultClientWebSocketSession): OutboundMessage = withTimeout(5.seconds) {
        val text = (session.incoming.receive() as Frame.Text).readText()
        json.decodeFromString(OutboundMessage.serializer(), text)
    }
}
