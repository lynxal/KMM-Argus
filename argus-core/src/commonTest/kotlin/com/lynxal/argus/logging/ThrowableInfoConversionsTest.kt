package com.lynxal.argus.logging

import com.lynxal.argus.model.toThrowableInfo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ThrowableInfoConversionsTest {

    @Test
    fun `simple throwable converts with className and message`() {
        val t = IllegalStateException("boom")

        val info = t.toThrowableInfo(captureStackTraces = true)

        assertEquals("IllegalStateException", info.className)
        assertEquals("boom", info.message)
        assertNull(info.cause)
    }

    @Test
    fun `cause chain recurses fully`() {
        val root = IllegalStateException("root")
        val mid = RuntimeException("mid", root)
        val top = IllegalArgumentException("top", mid)

        val info = top.toThrowableInfo(captureStackTraces = true)

        assertEquals("IllegalArgumentException", info.className)
        assertEquals("top", info.message)
        assertNotNull(info.cause)
        assertEquals("RuntimeException", info.cause!!.className)
        assertEquals("mid", info.cause!!.message)
        assertNotNull(info.cause!!.cause)
        assertEquals("IllegalStateException", info.cause!!.cause!!.className)
        assertEquals("root", info.cause!!.cause!!.message)
        assertNull(info.cause!!.cause!!.cause)
    }

    @Test
    fun `captureStackTraces=false yields empty stackTrace everywhere in the chain`() {
        val root = IllegalStateException("root")
        val top = RuntimeException("top", root)

        val info = top.toThrowableInfo(captureStackTraces = false)

        assertEquals("", info.stackTrace)
        assertEquals("", info.cause!!.stackTrace)
    }

    @Test
    fun `throwable with null message preserves null`() {
        val t = RuntimeException()

        val info = t.toThrowableInfo(captureStackTraces = false)

        assertNull(info.message)
    }

    @Test
    fun `captureStackTraces=true produces non-empty stackTrace from a real caught throwable`() {
        // This assertion holds on JVM/Android reliably; Native trace quality is checked
        // loosely (non-empty is enough for wire-round-trip intent). JVM-specific content
        // assertions live in jvmTest.
        val info = try {
            throw IllegalStateException("caught")
        } catch (t: Throwable) {
            t.toThrowableInfo(captureStackTraces = true)
        }

        assertTrue(info.stackTrace.isNotEmpty(), "expected non-empty stackTrace, got: '${info.stackTrace}'")
    }
}
