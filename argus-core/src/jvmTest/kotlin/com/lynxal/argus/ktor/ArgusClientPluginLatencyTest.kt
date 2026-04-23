@file:OptIn(ExperimentalCoroutinesApi::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.model.NoopEventBus
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertTrue

class ArgusClientPluginLatencyTest {

    @Test
    fun `plugin overhead p99 stays under 2ms against MockEngine`() {
        if (System.getProperty("argusLatencyTest.skip") == "true") return

        val iterations = 2_000
        val warmup = 500

        fun buildBaseline(): HttpClient = HttpClient(MockEngine {
            respond(
                content = "ok",
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "text/plain"),
            )
        })

        fun buildInstrumented(): HttpClient = HttpClient(MockEngine {
            respond(
                content = "ok",
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "text/plain"),
            )
        }) {
            install(Argus) { eventBus = NoopEventBus }
        }

        val baseline = sample(buildBaseline(), iterations, warmup)
        val instrumented = sample(buildInstrumented(), iterations, warmup)

        val overheads = instrumented.zip(baseline) { i, b -> (i - b).coerceAtLeast(0) }.sorted()
        val p99NsIndex = (overheads.size * 99 / 100).coerceAtMost(overheads.size - 1)
        val p99Ns = overheads[p99NsIndex]
        val p99Ms = p99Ns / 1_000_000.0

        assertTrue(
            p99Ms < 2.0,
            "plugin overhead p99 was ${p99Ms}ms, expected < 2ms (baseline p99=${baseline.sorted()[p99NsIndex] / 1e6}ms, instrumented p99=${instrumented.sorted()[p99NsIndex] / 1e6}ms)",
        )
    }

    private fun sample(client: HttpClient, iterations: Int, warmup: Int): LongArray = runBlocking {
        repeat(warmup) {
            client.get("https://api.example.com/latency").bodyAsText()
        }
        val samples = LongArray(iterations)
        for (i in 0 until iterations) {
            val start = System.nanoTime()
            client.get("https://api.example.com/latency").bodyAsText()
            samples[i] = System.nanoTime() - start
        }
        samples
    }
}
