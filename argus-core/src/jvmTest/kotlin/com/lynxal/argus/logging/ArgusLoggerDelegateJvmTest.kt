package com.lynxal.argus.logging

import com.lynxal.argus.ktor.RecordingEventBus
import com.lynxal.argus.model.LogEvent
import com.lynxal.argus.model.toThrowableInfo
import com.lynxal.logging.LogDetails
import com.lynxal.logging.LogLevel
import com.lynxal.logging.LoggerExtras
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ArgusLoggerDelegateJvmTest {

    @Test
    fun `jvm Throwable caught in real stack has non-blank stackTrace containing at frame`() {
        val info = try {
            throw RuntimeException("jvm-caught")
        } catch (t: Throwable) {
            t.toThrowableInfo(captureStackTraces = true)
        }

        assertTrue(info.stackTrace.isNotBlank(), "expected non-blank stack trace")
        assertTrue(
            info.stackTrace.contains("at "),
            "expected JVM 'at <frame>' line; got: '${info.stackTrace.take(200)}...'"
        )
    }

    @Test
    fun `jvm nested cause both have non-blank stack traces containing at frame`() {
        val top: Throwable = try {
            try {
                throw IllegalStateException("root-jvm")
            } catch (rootCause: Throwable) {
                throw RuntimeException("wrapper-jvm", rootCause)
            }
        } catch (caught: Throwable) {
            caught
        }

        val info = top.toThrowableInfo(captureStackTraces = true)
        val causeInfo = info.cause
        assertNotNull(causeInfo)

        assertTrue(info.stackTrace.contains("at "), "top-level trace missing 'at' frames")
        assertTrue(causeInfo.stackTrace.contains("at "), "cause-level trace missing 'at' frames")
    }

    @Test
    fun `delegate emits LogEvent with non-blank JVM stackTrace end-to-end`() {
        val bus = RecordingEventBus()
        val delegate = ArgusLoggerDelegate(bus)

        val thrown = try {
            throw IllegalArgumentException("e2e-jvm")
        } catch (t: Throwable) {
            t
        }

        delegate.log(
            LogDetails(logLevel = LogLevel.Error, message = "failure", cause = thrown),
            LoggerExtras(tag = "e2e"),
        )

        val event = bus.events.single() as LogEvent
        val info = event.throwable
        assertNotNull(info)
        assertTrue(info.stackTrace.contains("at "), "end-to-end LogEvent.throwable.stackTrace missing 'at' frames")
    }
}
