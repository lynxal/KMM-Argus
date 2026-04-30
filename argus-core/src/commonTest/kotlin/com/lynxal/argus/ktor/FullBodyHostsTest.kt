@file:OptIn(ExperimentalCoroutinesApi::class)

package com.lynxal.argus.ktor

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FullBodyHostsTest {

    private val twoMb = "x".repeat(2_000_000)
    private val oneMb: Long = 1_000_000

    @Test
    fun `request to a non-matched host respects maxBodyBytes`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) {
                eventBus = bus
                maxBodyBytes = oneMb
                fullBodyHosts = setOf("special.example.com")
            }
        }

        client.post("https://api.example.com/upload") {
            setBody(twoMb)
        }

        val req = bus.httpEvents().single().request
        assertEquals(twoMb.length.toLong(), req.bodyTruncatedTotalBytes)
        assertEquals(oneMb, req.bodyPreview?.length?.toLong())
    }

    @Test
    fun `request to a matched host captures full body`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) {
                eventBus = bus
                maxBodyBytes = oneMb
                fullBodyHosts = setOf("api.example.com")
            }
        }

        client.post("https://api.example.com/upload") {
            setBody(twoMb)
        }

        val req = bus.httpEvents().single().request
        assertNull(req.bodyTruncatedTotalBytes)
        assertEquals(twoMb.length, req.bodyPreview?.length)
    }

    @Test
    fun `host match is case-insensitive`() = runTest {
        val bus = RecordingEventBus()
        val client = HttpClient(MockEngine {
            respond(content = "ok", status = HttpStatusCode.OK)
        }) {
            install(Argus) {
                eventBus = bus
                maxBodyBytes = oneMb
                fullBodyHosts = setOf("API.example.COM")
            }
        }

        client.post("https://api.example.com/upload") {
            setBody(twoMb)
        }

        assertNull(bus.httpEvents().single().request.bodyTruncatedTotalBytes)
    }

    @Test
    fun `response from a matched host captures full body`() = runTest {
        val bus = RecordingEventBus()
        val bigBody = "y".repeat(2_000_000)
        val client = HttpClient(MockEngine {
            respond(
                content = bigBody,
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "text/plain"),
            )
        }) {
            install(Argus) {
                eventBus = bus
                maxBodyBytes = oneMb
                fullBodyHosts = setOf("api.example.com")
            }
        }

        client.get("https://api.example.com/download").bodyAsText()

        val resp = bus.httpEvents().single().response!!
        assertNull(resp.bodyTruncatedTotalBytes)
        assertEquals(bigBody.length, resp.bodyPreview?.length)
    }
}
