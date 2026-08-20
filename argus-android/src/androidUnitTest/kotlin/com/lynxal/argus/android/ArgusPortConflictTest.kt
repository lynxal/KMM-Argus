package com.lynxal.argus.android

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.net.ServerSocket
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Regression tests for the crash-on-start bug: Ktor's CIO engine performs `bind()` inside
 * its own coroutine, so a bind failure used to escape the facade's try/catch and reach the
 * global uncaught-exception handler — which terminates the host app.
 *
 * The uncaught-handler assertion is what actually proves the fix; asserting only on
 * `startupError` would pass even with the crash still present, because the error reaches
 * the handle through a separate path.
 *
 * The port is occupied by a plain [ServerSocket], not by a second Argus. Argus now allows
 * only one live server per process, so a second `start()` returns the running handle rather
 * than colliding — the only real collision left is with a socket Argus does not own, which
 * is also what a port clash looks like in production: some other process holds the port.
 */
@RunWith(RobolectricTestRunner::class)
class ArgusPortConflictTest {

    private val context get() = RuntimeEnvironment.getApplication()

    @Test
    fun `a pinned port that is already taken reports startupError without an uncaught exception`() =
        withUncaughtExceptionRecorder { uncaught ->
            withOccupiedPort { taken ->
                runBlocking {
                    val blocked = Argus.start(context) { port = taken }
                    try {
                        val error = withTimeout(STARTUP_TIMEOUT_MS) {
                            blocked.startupError.first { it != null }
                        }
                        assertNotNull(error, "expected startupError to be set")
                        assertNull(blocked.url.value, "url must stay null when the bind failed")
                    } finally {
                        blocked.stop()
                    }
                }
            }
            assertTrue(
                uncaught.isEmpty(),
                "bind failure escaped to the uncaught handler: ${uncaught.joinToString { it.toString() }}",
            )
        }

    @Test
    fun `portFallback rebinds on an OS-assigned port when the pinned port is taken`() =
        withUncaughtExceptionRecorder { uncaught ->
            withOccupiedPort { taken ->
                runBlocking {
                    val fallback = Argus.start(context) {
                        port = taken
                        portFallback = true
                    }
                    try {
                        val url = withTimeout(STARTUP_TIMEOUT_MS) { fallback.url.first { it != null } }
                        assertNotNull(url)
                        assertNotEquals(taken, portOf(url), "fallback must not reuse the taken port")
                        assertNull(fallback.startupError.value, "fallback start must not report an error")
                    } finally {
                        fallback.stop()
                    }
                }
            }
            assertTrue(uncaught.isEmpty(), "unexpected uncaught exception: $uncaught")
        }

    @Test
    fun `stop is safe before bind, after a failed start, and when called twice`() =
        withUncaughtExceptionRecorder { uncaught ->
            // Stop immediately, before the bind can possibly have completed.
            Argus.start(context) { port = 0 }.stop()

            withOccupiedPort { taken ->
                runBlocking {
                    val blocked = Argus.start(context) { port = taken }
                    withTimeout(STARTUP_TIMEOUT_MS) { blocked.startupError.first { it != null } }
                    blocked.stop()
                    blocked.stop()
                }
            }

            val healthy = Argus.start(context) { port = 0 }
            healthy.stop()
            healthy.stop()

            assertTrue(uncaught.isEmpty(), "stop pushed something to the uncaught handler: $uncaught")
        }

    private fun portOf(url: String): Int = url.substringAfterLast(':').toInt()

    /**
     * Holds a real listening socket for the duration of [body] and passes its port. A raw
     * socket rather than a second Argus: Argus is single-instance per process now, so it can
     * no longer collide with itself.
     */
    private fun withOccupiedPort(body: (Int) -> Unit) {
        ServerSocket(0).use { socket -> body(socket.localPort) }
    }

    /**
     * Installs a recording default uncaught-exception handler for the duration of [body].
     * On the JVM `handleCoroutineException` falls through to exactly this handler when no
     * [kotlinx.coroutines.CoroutineExceptionHandler] is in context, which is the crash path
     * under test.
     */
    private fun withUncaughtExceptionRecorder(body: (List<Throwable>) -> Unit) {
        val recorded = mutableListOf<Throwable>()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { _, throwable -> synchronized(recorded) { recorded += throwable } }
        try {
            body(recorded)
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(previous)
        }
    }

    private companion object {
        const val STARTUP_TIMEOUT_MS = 5_000L
    }
}
