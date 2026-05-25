@file:OptIn(ExperimentalCoroutinesApi::class, ExperimentalEncodingApi::class, io.ktor.utils.io.InternalAPI::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.model.NoopEventBus
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger as KtorLogger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readRemaining
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import kotlinx.io.readByteArray
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ArgusClientPluginTest {

    @Test
    fun `GET emits HttpEvent with method url-split status and durationMs`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine { request ->
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) { eventBus = bus }
        }

        client.get("https://api.example.com/v1/things?x=1")

        val events = bus.httpEvents()
        assertEquals(1, events.size)
        val e = events.single()
        assertEquals("GET", e.request.method)
        assertEquals("api.example.com", e.request.host)
        assertEquals("/v1/things", e.request.path)
        assertEquals(200, e.response?.statusCode)
        assertEquals("OK", e.response?.statusText)
        assertNotNull(e.durationMs)
        assertTrue(e.durationMs!! >= 0)
    }

    @Test
    fun `POST with text body captures UTF-8 preview`() = runTest {
        val bus = RecordingEventBus()
        val client = httpClient(bus) { respond("ack", HttpStatusCode.Created) }

        client.post("https://api.example.com/post") {
            contentType(ContentType.Text.Plain)
            setBody("hello world")
        }

        val e = bus.httpEvents().single()
        assertEquals("hello world", e.request.bodyPreview)
        assertEquals("text/plain", e.request.contentType?.substringBefore(';')?.trim())
    }

    @Test
    fun `POST with JSON body captures UTF-8 preview`() = runTest {
        val bus = RecordingEventBus()
        val client = httpClient(bus) { respond("{}", HttpStatusCode.OK) }

        client.post("https://api.example.com/items") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"x"}""")
        }

        val e = bus.httpEvents().single()
        assertEquals("""{"name":"x"}""", e.request.bodyPreview)
    }

    @Test
    fun `POST with binary body is captured as base64`() = runTest {
        val bus = RecordingEventBus()
        val client = httpClient(bus) { respond(ByteReadChannel(ByteArray(0)), HttpStatusCode.OK) }

        val binary = ByteArray(8) { (it * 31).toByte() }
        client.post("https://api.example.com/blob") {
            contentType(ContentType.Application.OctetStream)
            setBody(binary)
        }

        val e = bus.httpEvents().single()
        val preview = assertNotNull(e.request.bodyPreview)
        assertContentEquals(binary, Base64.decode(preview))
    }

    @Test
    fun `response text body is captured as UTF-8 preview`() = runTest {
        val bus = RecordingEventBus()
        val client = httpClient(bus) {
            respond(
                content = """{"ok":true}""",
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/json"),
            )
        }

        val text = client.get("https://api.example.com/v").bodyAsText()
        assertEquals("""{"ok":true}""", text)

        val e = bus.httpEvents().single()
        assertEquals("""{"ok":true}""", e.response?.bodyPreview)
    }

    @Test
    fun `response binary body is captured as base64`() = runTest {
        val bus = RecordingEventBus()
        val bytes = ByteArray(16) { it.toByte() }
        val client = httpClient(bus) {
            respond(
                content = ByteReadChannel(bytes),
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/octet-stream"),
            )
        }

        val received = client.get("https://api.example.com/blob").bodyAsChannel().readRemaining().readByteArray()
        assertContentEquals(bytes, received)

        val e = bus.httpEvents().single()
        val preview = assertNotNull(e.response?.bodyPreview)
        assertContentEquals(bytes, Base64.decode(preview))
    }

    @Test
    fun `streaming response still reaches real consumer byte-for-byte`() = runTest {
        val bus = RecordingEventBus()
        val payload = ByteArray(4 * 1024) { (it % 251).toByte() }
        val client = httpClient(bus) {
            respond(
                content = ByteReadChannel(payload),
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/octet-stream"),
            )
        }

        val received = client.get("https://api.example.com/stream")
            .bodyAsChannel().readRemaining().readByteArray()

        assertContentEquals(payload, received)
    }

    @Test
    fun `body exceeding maxBodyBytes populates bodyTruncatedTotalBytes`() = runTest {
        val bus = RecordingEventBus()
        val payload = ByteArray(2_000) { it.toByte() }
        val client = HttpClient(MockEngine {
            respond(
                content = ByteReadChannel(payload),
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/octet-stream"),
            )
        }) {
            install(Argus) {
                eventBus = bus
                maxBodyBytes = 512L
            }
        }

        client.get("https://api.example.com/big").bodyAsChannel().readRemaining().readByteArray()

        val e = bus.httpEvents().single()
        assertEquals(2_000L, e.response?.bodyTruncatedTotalBytes)
        val preview = assertNotNull(e.response?.bodyPreview)
        assertEquals(512, Base64.decode(preview).size)
    }

    @Test
    fun `redactHeaders match is case-insensitive and sets flag`() = runTest {
        val bus = RecordingEventBus()
        val client = httpClient(bus) {
            respond(
                content = "",
                status = HttpStatusCode.OK,
                headers = headersOf("Set-Cookie", "sess=abc"),
            )
        }

        client.get("https://api.example.com/x") {
            headers {
                append("authorization", "Bearer secret")
                append("X-Trace", "keep-me")
            }
        }

        val e = bus.httpEvents().single()
        val auth = e.request.headers.single { it.name.equals("authorization", ignoreCase = true) }
        assertEquals("***redacted***", auth.value)
        assertTrue(auth.redacted)

        val trace = e.request.headers.single { it.name.equals("X-Trace", ignoreCase = true) }
        assertEquals("keep-me", trace.value)
        assertTrue(!trace.redacted)

        val setCookie = e.response?.headers?.single { it.name.equals("Set-Cookie", ignoreCase = true) }
        assertNotNull(setCookie)
        assertEquals("***redacted***", setCookie.value)
        assertTrue(setCookie.redacted)
    }

    @Test
    fun `network failure emits HttpEvent with error populated`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine { throw RuntimeException("boom") }) {
            install(Argus) { eventBus = bus }
        }

        try {
            client.get("https://api.example.com/fail")
        } catch (_: Throwable) {
        }

        val e = bus.httpEvents().single()
        assertNull(e.response)
        val err = assertNotNull(e.error)
        assertEquals("boom", err.message)
    }

    @Test
    fun `NoopEventBus install records nothing`() = runTest {
        val client = HttpClient(MockEngine { respond("ok", HttpStatusCode.OK) }) {
            install(Argus) { eventBus = NoopEventBus }
        }
        val result = client.get("https://api.example.com/n").bodyAsText()
        assertEquals("ok", result)
    }

    // Regression: the host app was receiving "Channel was cancelled" from
    // bodyAsText() when Argus's old split()+launched-drainer design composed
    // with the Logging plugin's own ResponseObserver tee. The app's channel
    // must now be a brand-new ByteReadChannel that no Argus/observer pump
    // can cancel.

    @Test
    fun `body larger than cap is fully readable by app via streamed tail`() = runTest {
        val bus = RecordingEventBus()
        val payload = ByteArray(8 * 1024) { (it % 251).toByte() }
        val client = HttpClient(MockEngine {
            respond(
                content = ByteReadChannel(payload),
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/octet-stream"),
            )
        }) {
            install(Argus) {
                eventBus = bus
                maxBodyBytes = 1024L
            }
        }

        val received = client.get("https://api.example.com/big")
            .bodyAsChannel().readRemaining().readByteArray()

        assertContentEquals(payload, received)
        val e = bus.httpEvents().single()
        assertEquals(8_192L, e.response?.bodyTruncatedTotalBytes)
        val preview = assertNotNull(e.response?.bodyPreview)
        assertEquals(1024, Base64.decode(preview).size)
    }

    @Test
    fun `sequential reads with Ktor Logging at LogLevel-ALL never cancel app channel`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(
                content = "[]",
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/json"),
            )
        }) {
            install(Logging) {
                logger = object : KtorLogger {
                    override fun log(message: String) { /* simulate sink */ }
                }
                level = LogLevel.ALL
            }
            install(Argus) { eventBus = bus }
        }

        repeat(20) { i ->
            val text = client.get("https://api.example.com/item/$i").bodyAsText()
            assertEquals("[]", text)
        }
        assertEquals(20, bus.httpEvents().size)
    }

    // Regression for the `replaceResponse { sameChannel }` bug: Ktor's
    // DelegatedResponse.rawContent is `get() = origin.content()`, so the
    // lambda we pass to replaceResponse is re-invoked on EVERY rawContent
    // access. Returning the same ByteReadChannel instance each time would
    // let the first downstream consumer (Logging observer, BodyProgress,
    // ContentNegotiation, etc.) exhaust/cancel it, surfacing as
    // "Channel was cancelled" to subsequent readers — which is exactly
    // the production failure mode that bit ProvisionerKMP's /token call.
    @Test
    fun `wrapped response rawContent is independently readable across multiple accesses`() = runTest {
        val bus = RecordingEventBus()
        val payload = """{"access_token":"abc","refresh_token":"xyz"}"""
        val client = httpClient(bus) {
            respond(
                content = payload,
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/json"),
            )
        }

        val response = client.get("https://api.example.com/token")

        // Simulate downstream pipeline plugins each accessing rawContent
        // independently — they MUST each get their own fresh, fully-readable channel.
        val read1 = response.rawContent.readRemaining().readByteArray().decodeToString()
        val read2 = response.rawContent.readRemaining().readByteArray().decodeToString()
        val read3 = response.bodyAsText()

        assertEquals(payload, read1)
        assertEquals(payload, read2)
        assertEquals(payload, read3)
    }

    // Locks in the streamed-tail path's compatibility with Logging.ALL.
    // The two existing Logging.ALL tests use small (in-memory replay) bodies;
    // this one forces the > maxBodyBytes branch so a future change to the
    // tail-streaming code can't silently regress the observer-composition case.
    @Test
    fun `body exceeding cap is fully readable by app with Logging-ALL installed`() = runTest {
        val bus = RecordingEventBus()
        val payload = ByteArray(8 * 1024) { (it % 251).toByte() }
        val client = HttpClient(MockEngine {
            respond(
                content = ByteReadChannel(payload),
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/octet-stream"),
            )
        }) {
            install(Logging) {
                logger = object : KtorLogger {
                    override fun log(message: String) { /* simulate sink */ }
                }
                level = LogLevel.ALL
            }
            install(Argus) {
                eventBus = bus
                maxBodyBytes = 1024L
            }
        }

        val received = client.get("https://api.example.com/big")
            .bodyAsChannel().readRemaining().readByteArray()

        assertContentEquals(payload, received)
        val e = bus.httpEvents().single()
        assertEquals(8_192L, e.response?.bodyTruncatedTotalBytes)
        val preview = assertNotNull(e.response?.bodyPreview)
        assertEquals(1024, Base64.decode(preview).size)
    }

    @Test
    fun `concurrent reads with Ktor Logging at LogLevel-ALL never cancel app channel`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(
                content = """{"ok":true}""",
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "application/json"),
            )
        }) {
            install(Logging) {
                logger = object : KtorLogger {
                    override fun log(message: String) { /* simulate sink */ }
                }
                level = LogLevel.ALL
            }
            install(Argus) { eventBus = bus }
        }

        val texts = (1..10).map { i ->
            async { client.get("https://api.example.com/item/$i").bodyAsText() }
        }.awaitAll()

        assertEquals(10, texts.size)
        texts.forEach { assertEquals("""{"ok":true}""", it) }
        assertEquals(10, bus.httpEvents().size)
    }

}

private fun httpClient(
    bus: RecordingEventBus,
    handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData,
): HttpClient = HttpClient(MockEngine(handler)) {
    install(Argus) { eventBus = bus }
}

private fun assertContentEquals(expected: ByteArray, actual: ByteArray) {
    assertEquals(expected.size, actual.size, "sizes differ")
    for (i in expected.indices) {
        assertEquals(expected[i], actual[i], "byte $i differs")
    }
}
