package com.lynxal.argus.ios

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
 * runBlocking, not runTest: the server binds in real time and a virtual scheduler never
 * advances. Test names avoid parentheses — K/N rejects them in backticked names.
 */
class ArgusPortConflictTest {

    @Test
    fun `a pinned port that is already taken reports startupError instead of aborting`() {
        withUnhandledExceptionRecorder { unhandled ->
            runBlocking {
                val first = Argus.start { port = 0 }
                try {
                    val taken = portOf(withTimeout(STARTUP_TIMEOUT_MS) { first.url.first { it != null } }!!)

                    val second = Argus.start { port = taken }
                    try {
                        val error = withTimeout(STARTUP_TIMEOUT_MS) { second.startupError.first { it != null } }
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
                unhandled.isEmpty(),
                "bind failure reached the unhandled-exception hook: $unhandled",
            )
        }
    }

    @Test
    fun `portFallback rebinds on an OS-assigned port when the pinned port is taken`() {
        withUnhandledExceptionRecorder { unhandled ->
            runBlocking {
                val first = Argus.start { port = 0 }
                try {
                    val taken = portOf(withTimeout(STARTUP_TIMEOUT_MS) { first.url.first { it != null } }!!)

                    val second = Argus.start {
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
            assertTrue(unhandled.isEmpty(), "unexpected unhandled exception: $unhandled")
        }
    }

    @Test
    fun `stop is safe before bind and after a failed start and when called twice`() {
        withUnhandledExceptionRecorder { unhandled ->
            // Stop immediately, before the bind can possibly have completed.
            Argus.start { port = 0 }.stop()

            runBlocking {
                val holder = Argus.start { port = 0 }
                try {
                    val taken = portOf(withTimeout(STARTUP_TIMEOUT_MS) { holder.url.first { it != null } }!!)
                    val blocked = Argus.start { port = taken }
                    withTimeout(STARTUP_TIMEOUT_MS) { blocked.startupError.first { it != null } }
                    blocked.stop()
                    blocked.stop()
                } finally {
                    holder.stop()
                    holder.stop()
                }
            }
            assertTrue(unhandled.isEmpty(), "stop pushed something to the unhandled hook: $unhandled")
        }
    }

    private fun portOf(url: String): Int = url.substringAfterLast(':').toInt()

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
    }
}
