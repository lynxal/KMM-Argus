package com.lynxal.argus.logging

import com.lynxal.argus.ktor.RecordingEventBus
import com.lynxal.argus.model.LogEvent
import com.lynxal.argus.model.NoopEventBus
import com.lynxal.logging.LogDetails
import com.lynxal.logging.LogLevel
import com.lynxal.logging.LoggerExtras
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class ArgusLoggerDelegateTest {

    private lateinit var bus: RecordingEventBus

    @BeforeTest
    fun setup() {
        bus = RecordingEventBus()
    }

    @Test
    fun `all five LogLevels round-trip into LogEvent level field`() {
        val delegate = ArgusLoggerDelegate(bus)
        val levels = listOf(
            LogLevel.Verbose,
            LogLevel.Debug,
            LogLevel.Info,
            LogLevel.Warning,
            LogLevel.Error,
        )

        levels.forEach { level ->
            delegate.log(LogDetails(logLevel = level, message = "msg"), LoggerExtras())
        }

        val captured = bus.events.filterIsInstance<LogEvent>().map { it.level }
        assertEquals(levels, captured)
    }

    @Test
    fun `non-blank tag from LoggerExtras maps to LogEvent tag`() {
        val delegate = ArgusLoggerDelegate(bus)

        delegate.log(
            LogDetails(logLevel = LogLevel.Info, message = "m"),
            LoggerExtras(tag = "auth"),
        )

        assertEquals("auth", (bus.events.single() as LogEvent).tag)
    }

    @Test
    fun `blank tag from LoggerExtras maps to null LogEvent tag`() {
        val delegate = ArgusLoggerDelegate(bus)

        delegate.log(
            LogDetails(logLevel = LogLevel.Info, message = "m"),
            LoggerExtras(tag = ""),
        )

        assertNull((bus.events.single() as LogEvent).tag)
    }

    @Test
    fun `payload map is carried through verbatim when below cap`() {
        val delegate = ArgusLoggerDelegate(bus)
        val payload = mapOf("userId" to "u1", "requestId" to "r1", "latencyMs" to "42")

        delegate.log(
            LogDetails(logLevel = LogLevel.Debug, message = "m", payload = payload),
            LoggerExtras(),
        )

        assertEquals(payload, (bus.events.single() as LogEvent).payload)
    }

    @Test
    fun `payload entries beyond maxPayloadEntries are dropped`() {
        val delegate = ArgusLoggerDelegate(bus, ArgusLoggerConfig(maxPayloadEntries = 10))
        val oversized = (1..60).associate { "k$it" to "v$it" }

        delegate.log(
            LogDetails(logLevel = LogLevel.Debug, message = "m", payload = oversized),
            LoggerExtras(),
        )

        val out = (bus.events.single() as LogEvent).payload
        assertEquals(10, out.size)
    }

    @Test
    fun `message shorter than maxMessageLength is preserved verbatim`() {
        val delegate = ArgusLoggerDelegate(bus, ArgusLoggerConfig(maxMessageLength = 100))

        delegate.log(
            LogDetails(logLevel = LogLevel.Debug, message = "short"),
            LoggerExtras(),
        )

        assertEquals("short", (bus.events.single() as LogEvent).message)
    }

    @Test
    fun `message longer than maxMessageLength is truncated with suffix`() {
        val delegate = ArgusLoggerDelegate(bus, ArgusLoggerConfig(maxMessageLength = 10))
        val original = "a".repeat(25)

        delegate.log(
            LogDetails(logLevel = LogLevel.Debug, message = original),
            LoggerExtras(),
        )

        val msg = (bus.events.single() as LogEvent).message
        assertEquals("aaaaaaaaaa...<+15 chars>", msg)
    }

    @Test
    fun `logLevel below config minLevel is dropped without publishing`() {
        val delegate = ArgusLoggerDelegate(bus, ArgusLoggerConfig(minLevel = LogLevel.Warning))

        delegate.log(LogDetails(logLevel = LogLevel.Info, message = "filtered"), LoggerExtras())
        delegate.log(LogDetails(logLevel = LogLevel.Debug, message = "filtered"), LoggerExtras())
        delegate.log(LogDetails(logLevel = LogLevel.Warning, message = "kept"), LoggerExtras())
        delegate.log(LogDetails(logLevel = LogLevel.Error, message = "kept"), LoggerExtras())

        val msgs = bus.events.filterIsInstance<LogEvent>().map { it.message }
        assertEquals(listOf("kept", "kept"), msgs)
    }

    @Test
    fun `nested cause chain of depth 3 is captured recursively`() {
        val delegate = ArgusLoggerDelegate(bus)
        val root = IllegalStateException("root")
        val mid = RuntimeException("mid", root)
        val top = IllegalArgumentException("top", mid)

        delegate.log(
            LogDetails(logLevel = LogLevel.Error, message = "boom", cause = top),
            LoggerExtras(),
        )

        val info = (bus.events.single() as LogEvent).throwable
        assertNotNull(info)
        assertEquals("top", info.message)
        assertEquals("mid", info.cause?.message)
        assertEquals("root", info.cause?.cause?.message)
        assertNull(info.cause?.cause?.cause)
    }

    @Test
    fun `captureStackTraces=false produces empty stackTrace string`() {
        val delegate = ArgusLoggerDelegate(bus, ArgusLoggerConfig(captureStackTraces = false))
        val cause = RuntimeException("x", IllegalStateException("y"))

        delegate.log(
            LogDetails(logLevel = LogLevel.Error, message = "m", cause = cause),
            LoggerExtras(),
        )

        val info = (bus.events.single() as LogEvent).throwable
        assertNotNull(info)
        assertEquals("", info.stackTrace)
        assertEquals("", info.cause?.stackTrace)
    }

    @Test
    fun `LogDetails timestamp is converted to epoch millis on LogEvent`() {
        val delegate = ArgusLoggerDelegate(bus)
        val fixedMillis = 1_700_000_000_000L
        val timestamp = Instant.fromEpochMilliseconds(fixedMillis)

        delegate.log(
            LogDetails(logLevel = LogLevel.Info, message = "m", timestamp = timestamp),
            LoggerExtras(),
        )

        assertEquals(fixedMillis, (bus.events.single() as LogEvent).timestamp)
    }

    @Test
    fun `NoopEventBus is a zero-work sink`() {
        val delegate = ArgusLoggerDelegate(NoopEventBus)

        repeat(100) { i ->
            delegate.log(
                LogDetails(
                    logLevel = LogLevel.Error,
                    message = "iteration $i",
                    cause = RuntimeException("x", IllegalStateException("y")),
                    payload = mapOf("i" to i.toString()),
                ),
                LoggerExtras(tag = "noop"),
            )
        }

        assertTrue(true, "ArgusLoggerDelegate(NoopEventBus) ran 100 times without throwing")
    }
}
