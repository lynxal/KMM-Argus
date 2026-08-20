package com.lynxal.argus.android

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.IOException
import kotlin.test.assertNull

/**
 * A bind can finish after [ArgusHandle.stop] has returned — `server.start()` is
 * non-suspending once it returns, so cancelling the scope cannot preempt the callback,
 * and `stop()` spends ~1.1 s draining the engine first. The callbacks are driven
 * directly here rather than raced: the window is real but timing-dependent, and a test
 * that waits for it would be flaky in exactly the way this bug already made the
 * Kotlin/Native test reporter flaky.
 */
@RunWith(RobolectricTestRunner::class)
class ArgusHandleStopTest {

    private val context get() = RuntimeEnvironment.getApplication()

    @Test
    fun `a bind completing after stop does not republish url`() {
        val handle = Argus.start(context) { port = 0 }
        handle.stop()

        handle.onStarted()

        assertNull(handle.url.value, "stop() promises url stays null; a late bind republished it")
    }

    @Test
    fun `an engine error arriving after stop does not republish startupError`() {
        val handle = Argus.start(context) { port = 0 }
        handle.stop()

        handle.onFailed(IOException("engine died during teardown"))

        assertNull(
            handle.startupError.value,
            "stop() promises startupError stays null; a late failure republished it",
        )
    }
}
