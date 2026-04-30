@file:OptIn(ExperimentalCoroutinesApi::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.correlation.withCorrelation
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ArgusClientPluginCorrelationTest {

    @Test
    fun `request emitted inside withCorrelation stamps correlationId on HttpEvent`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) { eventBus = bus }
        }

        withCorrelation("trace-abc") {
            client.get("https://api.example.com/x")
        }

        val event = bus.httpEvents().single()
        assertEquals("trace-abc", event.correlationId)
    }

    @Test
    fun `request without an active element produces null correlationId`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) { eventBus = bus }
        }

        client.get("https://api.example.com/x")

        assertNull(bus.httpEvents().single().correlationId)
    }

    @Test
    fun `concurrent requests under different ids each carry their own`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) { eventBus = bus }
        }

        withCorrelation("alpha") { client.get("https://api.example.com/a") }
        withCorrelation("beta") { client.get("https://api.example.com/b") }

        val byPath = bus.httpEvents().associateBy { it.request.path }
        assertEquals("alpha", byPath["/a"]?.correlationId)
        assertEquals("beta", byPath["/b"]?.correlationId)
    }
}
