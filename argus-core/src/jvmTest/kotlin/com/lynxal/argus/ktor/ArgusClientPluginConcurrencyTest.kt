package com.lynxal.argus.ktor

import com.lynxal.argus.model.ArgusEvent
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.Collections
import kotlin.test.Test
import kotlin.test.assertEquals

class ArgusClientPluginConcurrencyTest {

    @Test
    fun `100 concurrent requests each get a unique id and preserved per-request ordering`() = runBlocking {
        val bus = ThreadSafeRecordingEventBus()
        val client = HttpClient(MockEngine { req ->
            respond(
                content = "ok-${req.url.encodedPath}",
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "text/plain"),
            )
        }) {
            install(Argus) { eventBus = bus }
        }

        val n = 100
        (0 until n)
            .map { i -> async { client.get("https://api.example.com/r$i").bodyAsText() } }
            .awaitAll()

        withTimeout(5_000) {
            while (bus.httpEvents().size < n) delay(5)
        }

        val events = bus.httpEvents()
        assertEquals(n, events.size)
        assertEquals(n, events.map { it.id }.toSet().size)
        events.forEach { ev ->
            assertEquals("ok-${ev.request.path}", ev.response?.bodyPreview)
        }
    }
}

private class ThreadSafeRecordingEventBus : RecordingEventBus() {
    private val recorded: MutableList<ArgusEvent> = Collections.synchronizedList(mutableListOf())

    override fun append(event: ArgusEvent) {
        recorded.add(event)
    }

    override val events: List<ArgusEvent> get() = synchronized(recorded) { recorded.toList() }
}
