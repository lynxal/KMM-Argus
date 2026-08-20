package com.lynxal.argus.android

import com.lynxal.argus.server.ArgusConfigBuilder
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.net.ServerSocket
import kotlin.test.assertEquals
import kotlin.test.assertNotSame
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Argus keeps one live server per process.
 *
 * Before this, `start()` twice bound a second port — with a pinned port the second call
 * reported `startupError`, which reads as a bug rather than "already running" — and a caller
 * that dropped its handle had no route back to the server it left running.
 */
@RunWith(RobolectricTestRunner::class)
class ArgusSingleInstanceTest {

    private val context get() = RuntimeEnvironment.getApplication()
    private val started = mutableListOf<ArgusHandle>()

    private fun start(configure: ArgusConfigBuilder.() -> Unit = { port = 0 }) =
        Argus.start(context, configure).also { started += it }

    // The registry is process-wide, so anything left running would leak into whatever test
    // runs next in the same JVM.
    @After
    fun tearDown() {
        started.forEach { runCatching { it.stop() } }
        started.clear()
    }

    @Test
    fun `start while already running returns the live handle instead of a second server`() {
        val first = start()
        val second = start()

        assertSame(first, second, "second start() bound another server instead of reusing the live one")
    }

    @Test
    fun `a dropped handle stays reachable through start`() {
        val leaked = start()

        // Simulates a caller that lost its reference: start() is the only route back, and
        // without it the server and its scope would run unreachable for the process lifetime.
        assertSame(leaked, start())
    }

    @Test
    fun `start after stop builds a fresh handle`() {
        val first = start()
        first.stop()

        val second = start()

        assertNotSame(first, second, "stop() left a stale registration, so restart returned the dead handle")
    }

    @Test
    fun `a failed handle is replaced rather than handed back`() {
        ServerSocket(0).use { blocker ->
            val failed = start { port = blocker.localPort }
            runBlocking { withTimeout(STARTUP_TIMEOUT_MS) { failed.startupError.first { it != null } } }

            // Returning `failed` here would strand Argus permanently: it can never rebind, so
            // every later start() would hand back the same dead handle.
            val replacement = start()
            assertNotSame(failed, replacement)
            runBlocking { withTimeout(STARTUP_TIMEOUT_MS) { replacement.url.first { it != null } } }
            assertNull(replacement.startupError.value)
        }
    }

    @Test
    fun `a sequential restart on the same pinned port rebinds`() {
        val port = ServerSocket(0).use { it.localPort }

        val first = start { this.port = port }
        val firstUrl = runBlocking { withTimeout(STARTUP_TIMEOUT_MS) { first.url.first { it != null } } }
        assertEquals(port, firstUrl!!.substringAfterLast(':').toInt())

        first.stop()

        val second = start { this.port = port }
        val secondUrl = runBlocking { withTimeout(STARTUP_TIMEOUT_MS) { second.url.first { it != null } } }
        assertNull(second.startupError.value)
        assertEquals(port, secondUrl!!.substringAfterLast(':').toInt())
    }

    @Test
    fun `starting while a stop is still draining rebinds the pinned port`() {
        val port = ServerSocket(0).use { it.localPort }

        val first = start { this.port = port }
        runBlocking { withTimeout(STARTUP_TIMEOUT_MS) { first.url.first { it != null } } }

        // The overlap only exists across threads: stop() blocks until the drain finishes.
        // isStopped flips at the very top of stop(), before the drain, giving a deterministic
        // "teardown has begun" signal rather than a sleep.
        val stopping = Thread { first.stop() }.apply { start() }
        val deadline = System.currentTimeMillis() + STARTUP_TIMEOUT_MS
        while (!first.isStopped && System.currentTimeMillis() < deadline) Thread.yield()
        assertTrue(first.isStopped, "stop() never began; cannot exercise the handover")

        // Ktor closes the listening socket before draining connections — measured at 37 ms
        // versus 121 ms for stop() to return — so the port is already free here and the new
        // bind succeeds. This locks that in: if a future Ktor or config change kept the
        // listener open for the whole drain, this is what would catch it.
        val second = start { this.port = port }
        val secondUrl = runBlocking { withTimeout(HANDOVER_TIMEOUT_MS) { second.url.first { it != null } } }

        stopping.join()
        assertNull(second.startupError.value, "restart during teardown collided on the pinned port")
        assertEquals(port, secondUrl!!.substringAfterLast(':').toInt())
    }

    private companion object {
        const val STARTUP_TIMEOUT_MS = 5_000L
        const val HANDOVER_TIMEOUT_MS = 10_000L
    }
}
