package com.lynxal.argus.server.routes

import com.lynxal.argus.model.ARGUS_SCHEMA_VERSION
import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.server.buffer.EventRingBuffer
import com.lynxal.argus.server.createTestAppInfo
import com.lynxal.argus.server.createTestCustomEvent
import com.lynxal.argus.server.createTestHttpEvent
import com.lynxal.argus.server.createTestHttpRequest
import com.lynxal.argus.server.createTestHttpResponse
import com.lynxal.argus.server.createTestLogEvent
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

class RoutesTest {

    private val json = Json {
        classDiscriminator = "type"
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    @Test
    fun `GET api info returns app info and schema version`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }

        val response = client.get("/api/info")

        assertEquals(HttpStatusCode.OK, response.status)
        val body = response.bodyAsText()
        assertTrue(body.contains("\"pkg\":\"com.example.canvas\""), body)
        assertTrue(body.contains("\"schemaVersion\":$ARGUS_SCHEMA_VERSION"), body)
        assertTrue(body.contains("\"device\":\"Pixel 7 Pro\""), body)
    }

    @Test
    fun `GET api events returns seeded snapshot`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, listOf(
            createTestHttpEvent(id = "a"),
            createTestLogEvent(id = "b"),
            createTestCustomEvent(id = "c"),
        ))

        val body = client.get("/api/events").bodyAsText()

        val events = json.decodeFromString(ListSerializer(ArgusEvent.serializer()), body)
        assertEquals(listOf("a", "b", "c"), events.map { it.id })
    }

    @Test
    fun `GET api events filters by source`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, listOf(
            createTestHttpEvent(id = "http-1"),
            createTestLogEvent(id = "log-1"),
        ))

        val body = client.get("/api/events?source=HTTP").bodyAsText()

        val events = json.decodeFromString(ListSerializer(ArgusEvent.serializer()), body)
        assertEquals(listOf("http-1"), events.map { it.id })
    }

    @Test
    fun `GET api events limit truncates to newest`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, (1..5).map { createTestHttpEvent(id = "evt-$it") })

        val body = client.get("/api/events?limit=2").bodyAsText()

        val events = json.decodeFromString(ListSerializer(ArgusEvent.serializer()), body)
        assertEquals(listOf("evt-4", "evt-5"), events.map { it.id })
    }

    @Test
    fun `GET api events before cursor returns events before id`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, (1..4).map { createTestHttpEvent(id = "evt-$it") })

        val body = client.get("/api/events?before=evt-3").bodyAsText()

        val events = json.decodeFromString(ListSerializer(ArgusEvent.serializer()), body)
        assertEquals(listOf("evt-1", "evt-2"), events.map { it.id })
    }

    @Test
    fun `GET api events by id returns single event`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, listOf(createTestHttpEvent(id = "target")))

        val response = client.get("/api/events/target")

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains("\"id\":\"target\""))
    }

    @Test
    fun `GET api events by unknown id returns 404`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }

        val response = client.get("/api/events/nope")

        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `GET request-body returns textual body as UTF-8`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, listOf(
            createTestHttpEvent(
                id = "t1",
                request = createTestHttpRequest(
                    bodyPreview = """{"k":"v"}""",
                    contentType = "application/json",
                ),
            ),
        ))

        val response = client.get("/api/events/t1/request-body")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("""{"k":"v"}""", response.bodyAsText())
        assertEquals(ContentType.Application.Json, response.contentType())
    }

    @Test
    fun `GET response-body binary decodes base64`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        // "hello" in base64 = aGVsbG8=
        seedAndAwait(buffer, listOf(
            createTestHttpEvent(
                id = "b1",
                response = createTestHttpResponse(
                    bodyPreview = "aGVsbG8=",
                    contentType = "application/octet-stream",
                ),
            ),
        ))

        val response = client.get("/api/events/b1/response-body")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("hello", response.bodyAsText())
    }

    @Test
    fun `GET request-body missing returns 404`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, listOf(
            createTestHttpEvent(
                id = "b2",
                request = createTestHttpRequest(bodyPreview = null),
            ),
        ))

        val response = client.get("/api/events/b2/request-body")

        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `DELETE api events clears buffer and returns 204`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }
        seedAndAwait(buffer, listOf(createTestHttpEvent()))

        val deleteResponse = client.delete("/api/events")
        buffer.snapshot.first { it.isEmpty() }

        assertEquals(HttpStatusCode.NoContent, deleteResponse.status)
        val after = client.get("/api/events").bodyAsText()
        assertTrue(after == "[]", "expected empty snapshot, got: $after")
    }

    @Test
    fun `GET root returns index html from bundle`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }

        val response = client.get("/")

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.contentType()?.match(ContentType.Text.Html) == true)
    }

    @Test
    fun `GET extensionless path falls back to index html`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }

        val response = client.get("/some/spa/route")

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.contentType()?.match(ContentType.Text.Html) == true)
    }

    @Test
    fun `GET unknown api path returns 404 not SPA`() = testApplication {
        val buffer = EventRingBuffer(maxEvents = 100)
        application { installArgusRoutes(buffer, createTestAppInfo(), emptyList()) }

        val response = client.get("/api/definitely-not-a-route")

        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    private suspend fun seedAndAwait(buffer: EventRingBuffer, events: List<ArgusEvent>) {
        events.forEach { buffer.offer(it) }
        buffer.snapshot.first { it.size >= events.size }
    }

    private fun io.ktor.client.statement.HttpResponse.contentType(): ContentType? =
        headers[io.ktor.http.HttpHeaders.ContentType]?.let { ContentType.parse(it) }
}
