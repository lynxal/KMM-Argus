package com.lynxal.argus.ios

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.server.ArgusServer
import com.lynxal.argus.server.argusConfig
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Argus keeps one live server per process.
 *
 * Before this, `start()` twice bound a second port — with a pinned port the second call
 * reported `startupError`, which reads as a bug rather than "already running" — and a caller
 * that dropped its handle had no route back to the server it left running.
 *
 * Test names avoid parentheses — K/N rejects them in backticked names.
 */
class ArgusSingleInstanceTest {

    private val started = mutableListOf<ArgusHandle>()

    private fun start(configure: com.lynxal.argus.server.ArgusConfigBuilder.() -> Unit = { port = 0 }) =
        Argus.start(configure).also { started += it }

    // The registry is process-wide, so anything left running would leak into whatever test
    // runs next in the same binary.
    @AfterTest
    fun tearDown() {
        started.forEach { runCatching { it.stop() } }
        started.clear()
    }

    @Test
    fun `start while already running returns the live handle instead of a second server`() {
        val first = start()
        val second = start()

        assertSame(first, second, "second start bound another server instead of reusing the live one")
    }

    @Test
    fun `a dropped handle stays reachable through start`() {
        val leaked = start()

        // Simulates a caller that lost its reference: start is the only route back, and without
        // it the server and its scope would run unreachable for the process lifetime.
        assertSame(leaked, start())
    }

    @Test
    fun `start after stop builds a fresh handle`() {
        val first = start()
        first.stop()

        val second = start()

        assertTrue(first !== second, "stop left a stale registration, so restart returned the dead handle")
    }

    @Test
    fun `a failed handle is replaced rather than handed back`() {
        runBlocking {
            val blocker = ArgusServer(argusConfig(BLOCKER_APP_INFO) { port = 0 })
            blocker.start()
            try {
                val failed = start { port = blocker.boundPort }
                withTimeout(STARTUP_TIMEOUT_MS) { failed.startupError.first { it != null } }

                // Returning `failed` here would strand Argus permanently: it can never rebind, so
                // every later start would hand back the same dead handle.
                val replacement = start()
                assertTrue(failed !== replacement)
                withTimeout(STARTUP_TIMEOUT_MS) { replacement.url.first { it != null } }
                assertNull(replacement.startupError.value)
            } finally {
                runCatching { blocker.stop() }
            }
        }
    }

    private companion object {
        const val STARTUP_TIMEOUT_MS = 5_000L
        val BLOCKER_APP_INFO = AppInfo(
            pkg = "com.lynxal.argus.test.blocker",
            versionName = "0",
            device = "test",
            argusVersion = "0",
        )
    }
}
