package com.lynxal.argus.ios

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.server.ArgusServer
import com.lynxal.argus.server.argusConfig
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.experimental.ExperimentalNativeApi
import kotlin.native.setUnhandledExceptionHook
import kotlin.test.Test
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Regression tests for the crash-on-start bug. Ktor's CIO engine binds inside a coroutine of
 * its own; with no handler in that coroutine's context the throwable reaches Kotlin/Native's
 * unhandled-exception hook, which aborts the host app. Reproduced here as
 * `PosixException.AddressAlreadyInUseException: EADDRINUSE (48)`.
 *
 * The hook assertion is the real test. Asserting only on `startupError` passes even with the
 * crash still present, because the error reaches the handle by a separate route.
 *
 * The port is occupied by a bare [ArgusServer], not by a second [Argus.start]. Argus allows
 * one live server per process now, so the facade can no longer collide with itself — and a
 * second Argus *process* holding the port is what this actually looks like in the field.
 *
 * runBlocking, not runTest: the server binds in real time and a virtual scheduler never
 * advances. Test names avoid parentheses — K/N rejects them in backticked names.
 */
class ArgusPortConflictTest {

    @Test
    fun `a pinned port that is already taken reports startupError instead of aborting`() {
        withUnhandledExceptionRecorder { unhandled ->
            runBlocking {
                withOccupiedPort { taken ->
                    val blocked = Argus.start { port = taken }
                    try {
                        val error = withTimeout(STARTUP_TIMEOUT_MS) { blocked.startupError.first { it != null } }
                        assertNotNull(error, "expected startupError to be set")
                        assertNull(blocked.url.value, "url must stay null when the bind failed")
                    } finally {
                        blocked.stop()
                    }
                }
            }
            assertTrue(
                unhandled.isEmpty(),
                "bind failure reached the unhandled-exception hook: $unhandled",
            )
        }
    }

    @Test
    fun `portFallback rebinds on an OS-assigned port when the pinned port is taken`() {
        withUnhandledExceptionRecorder { unhandled ->
            runBlocking {
                withOccupiedPort { taken ->
                    val fallback = Argus.start {
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
            assertTrue(unhandled.isEmpty(), "unexpected unhandled exception: $unhandled")
        }
    }

    @Test
    fun `stop is safe before bind and after a failed start and when called twice`() {
        withUnhandledExceptionRecorder { unhandled ->
            // Stop immediately, before the bind can possibly have completed.
            Argus.start { port = 0 }.stop()

            runBlocking {
                withOccupiedPort { taken ->
                    val blocked = Argus.start { port = taken }
                    withTimeout(STARTUP_TIMEOUT_MS) { blocked.startupError.first { it != null } }
                    blocked.stop()
                    blocked.stop()
                }
            }

            val healthy = Argus.start { port = 0 }
            healthy.stop()
            healthy.stop()

            assertTrue(unhandled.isEmpty(), "stop pushed something to the unhandled hook: $unhandled")
        }
    }

    private fun portOf(url: String): Int = url.substringAfterLast(':').toInt()

    /**
     * Holds a real Argus listener on an OS-assigned port for the duration of [body], built
     * directly rather than through [Argus.start] so the single-live-server rule does not
     * short-circuit it.
     */
    private suspend fun withOccupiedPort(body: suspend (Int) -> Unit) {
        val blocker = ArgusServer(argusConfig(BLOCKER_APP_INFO) { port = 0 })
        blocker.start()
        try {
            body(blocker.boundPort)
        } finally {
            runCatching { blocker.stop() }
        }
    }

    /**
     * Installs a recording unhandled-exception hook for the duration of [body] and puts the
     * previous one back afterwards — the hook is process-wide, so leaving it in place would
     * mask failures in whatever test runs next in the same binary.
     */
    @OptIn(ExperimentalNativeApi::class)
    private fun withUnhandledExceptionRecorder(body: (List<Throwable>) -> Unit) {
        val recorded = mutableListOf<Throwable>()
        val previous = setUnhandledExceptionHook { throwable -> recorded += throwable }
        try {
            body(recorded)
        } finally {
            setUnhandledExceptionHook(previous ?: { throwable -> throw throwable })
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
