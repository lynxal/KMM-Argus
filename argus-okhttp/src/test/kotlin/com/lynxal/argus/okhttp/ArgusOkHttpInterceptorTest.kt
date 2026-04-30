package com.lynxal.argus.okhttp

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.HttpEvent
import java.net.InetAddress
import java.net.Socket
import javax.net.SocketFactory
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

private class RecordingBus : ArgusEventBus {
    val events: MutableList<ArgusEvent> = mutableListOf()
    override fun publish(event: ArgusEvent) {
        events.add(event)
    }
}

class ArgusOkHttpInterceptorTest {

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

    private fun client(config: ArgusOkHttpConfig.() -> Unit = {}, bus: ArgusEventBus): OkHttpClient {
        val cfg = ArgusOkHttpConfig().apply(config)
        return OkHttpClient.Builder()
            .addInterceptor(ArgusOkHttpInterceptor(bus, cfg))
            .build()
    }

    @Test
    fun `200 response emits HttpEvent with engine=okhttp`() {
        val bus = RecordingBus()
        server.enqueue(MockResponse().setBody("""{"ok":true}""").setHeader("Content-Type", "application/json"))

        val request = Request.Builder().url(server.url("/users/1")).build()
        client(bus = bus).newCall(request).execute().use { response ->
            assertEquals(200, response.code)
            response.body?.string() // consume so the chain matches a real call
        }

        val event = bus.events.single() as HttpEvent
        assertEquals("okhttp", event.engine)
        assertEquals(200, event.response?.statusCode)
        assertEquals("""{"ok":true}""", event.response?.bodyPreview)
        assertNotNull(event.durationMs)
        assertTrue(event.id.isNotBlank())
    }

    @Test
    fun `Authorization header is redacted`() {
        val bus = RecordingBus()
        server.enqueue(MockResponse().setResponseCode(200))

        val request = Request.Builder()
            .url(server.url("/secure"))
            .header("Authorization", "Bearer secret")
            .build()
        client(bus = bus).newCall(request).execute().close()

        val event = bus.events.single() as HttpEvent
        val auth = event.request.headers.single { it.name.equals("Authorization", ignoreCase = true) }
        assertEquals("***redacted***", auth.value)
        assertEquals(true, auth.redacted)
    }

    @Test
    fun `oversized response body is reported as truncated`() {
        val bus = RecordingBus()
        val large = "x".repeat(50_000)
        server.enqueue(MockResponse().setBody(large).setHeader("Content-Type", "text/plain"))

        client(bus = bus, config = { maxBodyBytes = 1_000L })
            .newCall(Request.Builder().url(server.url("/big")).build())
            .execute()
            .close()

        val event = bus.events.single() as HttpEvent
        assertEquals(50_000L, event.response?.bodyTruncatedTotalBytes)
        assertEquals(1_000, event.response?.bodyPreview?.length)
    }

    @Test
    fun `fullBodyHosts bypasses the cap for matching hosts`() {
        val bus = RecordingBus()
        val large = "y".repeat(50_000)
        server.enqueue(MockResponse().setBody(large).setHeader("Content-Type", "text/plain"))

        client(
            bus = bus,
            config = {
                maxBodyBytes = 1_000L
                fullBodyHosts = setOf(server.hostName)
            },
        ).newCall(Request.Builder().url(server.url("/big")).build()).execute().close()

        val event = bus.events.single() as HttpEvent
        assertNull(event.response?.bodyTruncatedTotalBytes)
        assertEquals(large, event.response?.bodyPreview)
    }

    @Test
    fun `request body is captured and chain still receives an unconsumed body`() {
        val bus = RecordingBus()
        server.enqueue(MockResponse().setResponseCode(200))

        val payload = """{"hello":"world"}"""
        val request = Request.Builder()
            .url(server.url("/echo"))
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        client(bus = bus).newCall(request).execute().close()

        val received = server.takeRequest()
        assertEquals(payload, received.body.readUtf8())

        val event = bus.events.single() as HttpEvent
        assertEquals(payload, event.request.bodyPreview)
        assertEquals(payload.length.toLong(), event.request.sizeBytes)
    }

    @Test
    fun `IOException emits an HttpEvent with error and rethrows`() {
        val bus = RecordingBus()
        // Use a socket factory that always throws to guarantee an IOException at connect time.
        val client = OkHttpClient.Builder()
            .addInterceptor(ArgusOkHttpInterceptor(bus, ArgusOkHttpConfig()))
            .socketFactory(object : SocketFactory() {
                override fun createSocket(): Socket = throw java.io.IOException("boom")
                override fun createSocket(host: String, port: Int): Socket = throw java.io.IOException("boom")
                override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket = throw java.io.IOException("boom")
                override fun createSocket(host: InetAddress, port: Int): Socket = throw java.io.IOException("boom")
                override fun createSocket(address: InetAddress, port: Int, localAddress: InetAddress, localPort: Int): Socket = throw java.io.IOException("boom")
            })
            .build()

        try {
            client.newCall(Request.Builder().url(server.url("/x")).build()).execute()
            fail("expected IOException")
        } catch (_: java.io.IOException) {
            // expected
        }

        val event = bus.events.single() as HttpEvent
        assertNull(event.response)
        assertNotNull(event.error)
    }
}
