package com.lynxal.argus.urlconnection

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.HttpEvent
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

private class RecordingBus : ArgusEventBus {
    val events: MutableList<ArgusEvent> = mutableListOf()
    override fun publish(event: ArgusEvent) {
        events.add(event)
    }
}

class ArgusHttpURLConnectionTest {

    private lateinit var server: MockWebServer

    @BeforeTest
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @AfterTest
    fun stop() {
        server.shutdown()
    }

    private fun open(url: URL): HttpURLConnection = url.openConnection() as HttpURLConnection

    @Test
    fun `200 GET emits HttpEvent with engine=urlconnection`() {
        val bus = RecordingBus()
        server.enqueue(
            MockResponse()
                .setBody("""{"ok":true}""")
                .setHeader("Content-Type", "application/json"),
        )

        val raw = open(server.url("/users/1").toUrl())
        val conn = ArgusUrlConnection.wrap(raw, bus)
        try {
            assertEquals(200, conn.responseCode)
            conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }

        val event = bus.events.single() as HttpEvent
        assertEquals("urlconnection", event.engine)
        assertEquals(200, event.response?.statusCode)
        assertEquals("""{"ok":true}""", event.response?.bodyPreview)
        assertNotNull(event.durationMs)
        assertTrue(event.id.isNotBlank())
    }

    @Test
    fun `Authorization request header is redacted`() {
        val bus = RecordingBus()
        server.enqueue(MockResponse().setResponseCode(200))

        val raw = open(server.url("/secure").toUrl())
        val conn = ArgusUrlConnection.wrap(raw, bus)
        conn.setRequestProperty("Authorization", "Bearer secret")
        try {
            conn.responseCode
            conn.inputStream.use { }
        } finally {
            conn.disconnect()
        }

        val event = bus.events.single() as HttpEvent
        val auth = event.request.headers.single { it.name.equals("Authorization", ignoreCase = true) }
        assertEquals("***redacted***", auth.value)
        assertEquals(true, auth.redacted)
    }

    @Test
    fun `oversized response body is reported as truncated`() {
        val bus = RecordingBus()
        val large = "x".repeat(50_000)
        server.enqueue(
            MockResponse()
                .setBody(large)
                .setHeader("Content-Type", "text/plain"),
        )

        val raw = open(server.url("/big").toUrl())
        val cfg = ArgusUrlConnectionConfig().apply { maxBodyBytes = 1_000L }
        val conn = ArgusUrlConnection.wrap(raw, bus, cfg)
        try {
            conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }

        val event = bus.events.single() as HttpEvent
        assertEquals(50_000L, event.response?.bodyTruncatedTotalBytes)
        assertEquals(1_000, event.response?.bodyPreview?.length)
    }

    @Test
    fun `fullBodyHosts bypasses the cap for matching hosts`() {
        val bus = RecordingBus()
        val large = "y".repeat(50_000)
        server.enqueue(
            MockResponse()
                .setBody(large)
                .setHeader("Content-Type", "text/plain"),
        )

        val raw = open(server.url("/big").toUrl())
        val cfg = ArgusUrlConnectionConfig().apply {
            maxBodyBytes = 1_000L
            fullBodyHosts = setOf(server.hostName)
        }
        val conn = ArgusUrlConnection.wrap(raw, bus, cfg)
        try {
            conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }

        val event = bus.events.single() as HttpEvent
        assertNull(event.response?.bodyTruncatedTotalBytes)
        assertEquals(large, event.response?.bodyPreview)
    }

    @Test
    fun `POST request body is captured`() {
        val bus = RecordingBus()
        server.enqueue(MockResponse().setResponseCode(200))

        val raw = open(server.url("/echo").toUrl())
        raw.requestMethod = "POST"
        raw.doOutput = true
        raw.setRequestProperty("Content-Type", "text/plain")
        val payload = "hello-world"
        val conn = ArgusUrlConnection.wrap(raw, bus)
        try {
            conn.outputStream.use { it.write(payload.toByteArray()) }
            conn.responseCode
            conn.inputStream.use { }
        } finally {
            conn.disconnect()
        }

        val received = server.takeRequest()
        assertEquals(payload, received.body.readUtf8())

        val event = bus.events.single() as HttpEvent
        assertEquals(payload, event.request.bodyPreview)
        assertEquals(payload.length.toLong(), event.request.sizeBytes)
    }

    @Test
    fun `4xx response surfaces the error stream`() {
        val bus = RecordingBus()
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setBody("not found")
                .setHeader("Content-Type", "text/plain"),
        )

        val raw = open(server.url("/missing").toUrl())
        val conn = ArgusUrlConnection.wrap(raw, bus)
        try {
            assertEquals(404, conn.responseCode)
            conn.errorStream?.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }

        val event = bus.events.single() as HttpEvent
        assertEquals(404, event.response?.statusCode)
        assertEquals("not found", event.response?.bodyPreview)
    }

    @Test
    fun `IOException at responseCode emits an error event`() {
        val bus = RecordingBus()
        // Point at a closed port to force an IOException at responseCode.
        val unreachable = "http://127.0.0.1:1"
        val raw = URL(unreachable).openConnection() as HttpURLConnection
        raw.connectTimeout = 250
        val conn = ArgusUrlConnection.wrap(raw, bus)
        try {
            conn.responseCode
            fail("expected IOException")
        } catch (_: IOException) {
            // expected
        } finally {
            conn.disconnect()
        }

        val event = bus.events.firstOrNull { (it as? HttpEvent)?.error != null } as? HttpEvent
        assertNotNull(event)
        assertNull(event.response)
    }
}
