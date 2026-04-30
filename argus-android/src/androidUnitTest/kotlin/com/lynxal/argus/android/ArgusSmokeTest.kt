package com.lynxal.argus.android

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class ArgusSmokeTest {

    private val context get() = RuntimeEnvironment.getApplication()

    @Test
    fun `start returns a handle whose url eventually becomes a bound http URL`() = runBlocking {
        val handle = Argus.start(context) { port = 0 }
        try {
            val url = withTimeout(5_000) { handle.url.first { it != null } }
            assertNotNull(url)
            assertTrue(url.startsWith("http://"), "expected http:// URL, got $url")
        } finally {
            handle.stop()
        }
        // After stop, url is reset.
        assertNull(handle.url.value)
    }
}
