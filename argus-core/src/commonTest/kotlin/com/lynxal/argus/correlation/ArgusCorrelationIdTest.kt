package com.lynxal.argus.correlation

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ArgusCorrelationIdTest {

    @Test
    fun `currentCorrelationId returns null without an active element`() = runTest {
        assertNull(currentCorrelationId())
    }

    @Test
    fun `withCorrelation sets a fresh id`() = runTest {
        withCorrelation {
            val id = currentCorrelationId()
            assertNotNull(id)
            assertEquals(16, id.length)
        }
        assertNull(currentCorrelationId())
    }

    @Test
    fun `withCorrelation accepts an explicit id`() = runTest {
        withCorrelation("abc123") {
            assertEquals("abc123", currentCorrelationId())
        }
    }

    @Test
    fun `id propagates into launch and async children`() = runTest {
        val seen = mutableListOf<String?>()
        withCorrelation("parent") {
            coroutineScope {
                launch { seen += currentCorrelationId() }
                val deferred = async { currentCorrelationId() }
                seen += deferred.await()
            }
        }
        assertEquals(listOf<String?>("parent", "parent"), seen)
    }

    @Test
    fun `nested withCorrelation overrides outer id`() = runTest {
        withCorrelation("outer") {
            assertEquals("outer", currentCorrelationId())
            withCorrelation("inner") {
                assertEquals("inner", currentCorrelationId())
            }
            assertEquals("outer", currentCorrelationId())
        }
    }

    @Test
    fun `id survives withContext dispatch hops`() = runTest {
        withCorrelation("hop") {
            withContext(coroutineContext) {
                assertEquals("hop", currentCorrelationId())
            }
        }
    }

    @Test
    fun `two new() invocations produce distinct ids`() {
        val a = ArgusCorrelationId.new().value
        val b = ArgusCorrelationId.new().value
        assertNotEquals(a, b)
    }
}
