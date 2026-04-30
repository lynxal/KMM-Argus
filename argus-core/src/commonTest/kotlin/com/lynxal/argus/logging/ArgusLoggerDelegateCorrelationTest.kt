package com.lynxal.argus.logging

import com.lynxal.argus.correlation.withCorrelation
import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.LogEvent
import com.lynxal.logging.LogDetails
import com.lynxal.logging.LogLevel
import com.lynxal.logging.LoggerExtras
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Clock

class ArgusLoggerDelegateCorrelationTest {

    private class CollectingBus : ArgusEventBus {
        val events = mutableListOf<ArgusEvent>()
        override fun publish(event: ArgusEvent) {
            events += event
        }
    }

    private fun ArgusLoggerDelegate.fire(message: String) {
        log(
            LogDetails(
                logLevel = LogLevel.Info,
                message = message,
                payload = emptyMap(),
                cause = null,
                timestamp = Clock.System.now(),
            ),
            LoggerExtras(tag = "test"),
        )
    }

    @Test
    fun `log inside withCorrelation stamps id on LogEvent`() = runTest {
        val bus = CollectingBus()
        val delegate = ArgusLoggerDelegate(bus)

        withCorrelation("log-trace") {
            delegate.fire("hello")
        }

        val log = bus.events.filterIsInstance<LogEvent>().single()
        assertEquals("log-trace", log.correlationId)
    }

    @Test
    fun `log outside any correlation produces null correlationId`() {
        val bus = CollectingBus()
        val delegate = ArgusLoggerDelegate(bus)

        delegate.fire("orphan")

        val log = bus.events.filterIsInstance<LogEvent>().single()
        assertNull(log.correlationId)
    }

    @Test
    fun `correlationId is restored after the scope exits`() = runTest {
        val bus = CollectingBus()
        val delegate = ArgusLoggerDelegate(bus)

        withCorrelation("inside") {
            delegate.fire("scoped")
        }
        delegate.fire("after")

        val logs = bus.events.filterIsInstance<LogEvent>()
        assertEquals("inside", logs[0].correlationId)
        assertNull(logs[1].correlationId)
    }
}
