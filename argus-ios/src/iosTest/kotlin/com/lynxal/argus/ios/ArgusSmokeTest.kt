package com.lynxal.argus.ios

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ArgusSmokeTest {

    // runBlocking (not runTest) because the server actually binds in real time on
    // Dispatchers.IO; runTest's virtual scheduler would never advance.
    @Test
    fun `start returns a handle whose url eventually becomes a bound http URL`() = runBlocking {
        val handle = Argus.start { port = 0 }
        try {
            val url = withTimeout(5_000) { handle.url.first { it != null } }
            assertNotNull(url)
            assertTrue(url.startsWith("http://"), "expected http:// URL, got $url")
        } finally {
            handle.stop()
        }
        assertNull(handle.url.value)
    }
}
