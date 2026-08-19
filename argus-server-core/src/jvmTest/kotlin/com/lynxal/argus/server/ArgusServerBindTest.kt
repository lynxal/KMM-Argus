package com.lynxal.argus.server

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Bind-failure behaviour of [ArgusServer] against a real socket. The route tests use
 * `testApplication`, which never binds one, so this is the only coverage of the engine's
 * actual startup path.
 */
class ArgusServerBindTest {

    @Test
    fun `binding an occupied port throws instead of reaching the uncaught handler`() = runBlocking {
        withUncaughtExceptionRecorder { uncaught ->
            val first = ArgusServer(createTestArgusConfig(port = 0))
            first.start()
            try {
                val second = ArgusServer(createTestArgusConfig(port = first.boundPort))
                assertFailsWith<Throwable> { second.start() }
                assertNull(second.engineError.value, "a startup failure belongs on start(), not engineError")
                second.stop()
            } finally {
                first.stop()
            }
            assertTrue(
                uncaught.isEmpty(),
                "bind failure escaped to the uncaught handler: $uncaught",
            )
        }
    }

    @Test
    fun `portFallback rebinds on a free port and reports the port it actually bound`() = runBlocking {
        val first = ArgusServer(createTestArgusConfig(port = 0))
        first.start()
        try {
            val taken = first.boundPort
            val second = ArgusServer(createTestArgusConfig(port = taken, portFallback = true))
            second.start()
            try {
                assertNotEquals(taken, second.boundPort, "fallback must not reuse the taken port")
                assertTrue(second.boundPort > 0)
            } finally {
                second.stop()
            }
        } finally {
            first.stop()
        }
    }

    @Test
    fun `a failed start leaves the server retryable`() = runBlocking {
        val first = ArgusServer(createTestArgusConfig(port = 0))
        first.start()
        val taken = first.boundPort

        val second = ArgusServer(createTestArgusConfig(port = taken))
        assertFailsWith<Throwable> { second.start() }

        // Freeing the port must make the very same instance startable — before the fix the
        // failed attempt left a dead engine behind and this tripped the "called twice" guard.
        first.stop()
        second.start()
        try {
            assertEquals(taken, second.boundPort)
        } finally {
            second.stop()
        }
    }

    private inline fun withUncaughtExceptionRecorder(body: (List<Throwable>) -> Unit) {
        val recorded = mutableListOf<Throwable>()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { _, throwable -> synchronized(recorded) { recorded += throwable } }
        try {
            body(recorded)
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(previous)
        }
    }
}
