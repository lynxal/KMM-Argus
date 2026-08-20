package com.lynxal.argus.ios

import kotlin.test.Test
import kotlin.test.assertNull

/**
 * A bind can finish after [ArgusHandle.stop] has returned — `server.start()` is
 * non-suspending once it returns, so cancelling the scope cannot preempt the callback,
 * and `stop()` spends ~1.1 s draining the engine first. The callbacks are driven
 * directly rather than raced: the late `[Argus] listening on` line this produced is what
 * made the Kotlin/Native test reporter throw "Received output for test that is not
 * running", so racing it here would reproduce that flake instead of testing the fix.
 *
 * Test names avoid parentheses — K/N rejects them in backticked names.
 */
class ArgusHandleStopTest {

    @Test
    fun `a bind completing after stop does not republish url`() {
        val handle = Argus.start { port = 0 }
        handle.stop()

        handle.onStarted()

        assertNull(handle.url.value, "stop promises url stays null; a late bind republished it")
    }

    @Test
    fun `an engine error arriving after stop does not republish startupError`() {
        val handle = Argus.start { port = 0 }
        handle.stop()

        handle.onFailed(IllegalStateException("engine died during teardown"))

        assertNull(
            handle.startupError.value,
            "stop promises startupError stays null; a late failure republished it",
        )
    }
}
