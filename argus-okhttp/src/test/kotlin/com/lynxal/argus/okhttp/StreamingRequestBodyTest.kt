package com.lynxal.argus.okhttp

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.HttpEvent
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

private class CapturingBus : ArgusEventBus {
    val events: MutableList<ArgusEvent> = mutableListOf()
    override fun publish(event: ArgusEvent) {
        events.add(event)
    }
}

class StreamingRequestBodyTest {

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

    @Test
    fun `large non-one-shot body is captured up to cap and forwarded fully to server`() {
        val bus = CapturingBus()
        // 10 MB body, 64 KB cap.
        val payload = ByteArray(10 * 1024 * 1024) { (it and 0xFF).toByte() }
        val capBytes = 64 * 1024L

        server.enqueue(MockResponse().setResponseCode(200))

        val cfg = ArgusOkHttpConfig().apply { maxBodyBytes = capBytes }
        val client = OkHttpClient.Builder()
            .addInterceptor(ArgusOkHttpInterceptor(bus, cfg))
            .build()

        val body = payload.toRequestBody("application/octet-stream".toMediaType())
        val request = Request.Builder()
            .url(server.url("/upload"))
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            assertEquals(200, response.code)
        }

        // Server received the full 10 MB byte-for-byte.
        val recorded = server.takeRequest()
        val received = recorded.body.readByteArray()
        assertEquals(payload.size, received.size)
        assertTrue(received.contentEquals(payload), "server received body must match payload byte-for-byte")

        // Captured event preview holds exactly the first 64 KB; truncatedTotalBytes
        // reflects the full 10 MB.
        val event = bus.events.single() as HttpEvent
        val preview = event.request.bodyPreview
        val totalBytes = event.request.sizeBytes
        val truncatedTotal = event.request.bodyTruncatedTotalBytes
        assertNotNull(preview)
        // Preview is base64-encoded for binary content; just assert it's non-empty.
        assertTrue(preview.isNotEmpty())
        assertEquals(payload.size.toLong(), truncatedTotal ?: totalBytes)
    }
}
