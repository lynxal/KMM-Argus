package com.lynxal.argus.android

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
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
 */
@RunWith(RobolectricTestRunner::class)
class ArgusPortConflictTest {

    private val context get() = RuntimeEnvironment.getApplication()

    @Test
    fun `a pinned port that is already taken reports startupError without an uncaught exception`() =
        withUncaughtExceptionRecorder { uncaught ->
            runBlocking {
                val first = Argus.start(context) { port = 0 }
                try {
                    val taken = portOf(withTimeout(STARTUP_TIMEOUT_MS) { first.url.first { it != null } }!!)

                    val second = Argus.start(context) { port = taken }
                    try {
                        val error = withTimeout(STARTUP_TIMEOUT_MS) {
                            second.startupError.first { it != null }
                        }
                        assertNotNull(error, "expected startupError to be set")
                        assertNull(second.url.value, "url must stay null when the bind failed")
                    } finally {
                        second.stop()
                    }
                } finally {
                    first.stop()
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
            runBlocking {
                val first = Argus.start(context) { port = 0 }
                try {
                    val taken = portOf(withTimeout(STARTUP_TIMEOUT_MS) { first.url.first { it != null } }!!)

                    val second = Argus.start(context) {
                        port = taken
                        portFallback = true
                    }
                    try {
                        val url = withTimeout(STARTUP_TIMEOUT_MS) { second.url.first { it != null } }
                        assertNotNull(url)
                        assertNotEquals(taken, portOf(url), "fallback must not reuse the taken port")
                        assertNull(second.startupError.value, "fallback start must not report an error")
                    } finally {
                        second.stop()
                    }
                } finally {
                    first.stop()
                }
            }
            assertTrue(uncaught.isEmpty(), "unexpected uncaught exception: $uncaught")
        }

    @Test
    fun `stop is safe before bind, after a failed start, and when called twice`() =
        withUncaughtExceptionRecorder { uncaught ->
            // Stop immediately, before the bind can possibly have completed.
            Argus.start(context) { port = 0 }.stop()

            runBlocking {
                val holder = Argus.start(context) { port = 0 }
                try {
                    val taken = portOf(withTimeout(STARTUP_TIMEOUT_MS) { holder.url.first { it != null } }!!)
                    val blocked = Argus.start(context) { port = taken }
                    withTimeout(STARTUP_TIMEOUT_MS) { blocked.startupError.first { it != null } }
                    blocked.stop()
                    blocked.stop()
                } finally {
                    holder.stop()
                    holder.stop()
                }
            }
            assertTrue(uncaught.isEmpty(), "stop pushed something to the uncaught handler: $uncaught")
        }

    private fun portOf(url: String): Int = url.substringAfterLast(':').toInt()

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
