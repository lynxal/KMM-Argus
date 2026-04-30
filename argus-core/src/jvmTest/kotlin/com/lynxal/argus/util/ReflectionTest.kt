@file:OptIn(com.lynxal.argus.capture.InternalArgusApi::class)

package com.lynxal.argus.util

import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReflectionTest {

    @Test
    fun `bestEffortFqn returns full qualified name on JVM`() {
        assertEquals("java.io.IOException", IOException()::class.bestEffortFqn())
    }

    @Test
    fun `bestEffortFqn distinguishes same simpleName across packages`() {
        val a = ClassA()
        val b = ClassB()
        assertEquals("com.lynxal.argus.util.ReflectionTest.ClassA", a::class.bestEffortFqn())
        assertEquals("com.lynxal.argus.util.ReflectionTest.ClassB", b::class.bestEffortFqn())
        assertTrue(a::class.bestEffortFqn() != b::class.bestEffortFqn())
    }

    private class ClassA
    private class ClassB
}
