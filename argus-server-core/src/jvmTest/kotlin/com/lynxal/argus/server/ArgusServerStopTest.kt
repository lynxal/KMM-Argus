package com.lynxal.argus.server

import java.net.ServerSocket
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * `stop()` must never throw and must always release the socket. Argus is a debugging aid; it is
 * not allowed to take the host app down, least of all on the way out.
 */
class ArgusServerStopTest {

    private fun portIsFree(port: Int): Boolean = runCatching { ServerSocket(port).close() }.isSuccess

    @Test
    fun `stop releases the port`(): Unit = runBlocking {
        val server = ArgusServer(createTestArgusConfig(port = 0))
        server.start()
        val port = server.boundPort
        server.stop()
        assertTrue(portIsFree(port), "port $port still bound after stop()")
    }

    @Test
    fun `stopSuspend releases the port`(): Unit = runBlocking {
        val server = ArgusServer(createTestArgusConfig(port = 0))
        server.start()
        val port = server.boundPort
        server.stopSuspend()
        assertTrue(portIsFree(port), "port $port still bound after stopSuspend()")
    }

    @Test
    fun `stop is idempotent`(): Unit = runBlocking {
        val server = ArgusServer(createTestArgusConfig(port = 0))
        server.start()
        server.stop()
        server.stop()
        server.stopSuspend()
    }

    @Test
    fun `stop before start does nothing and does not throw`() {
        ArgusServer(createTestArgusConfig(port = 0)).stop()
    }

    @Test
    fun `stop after a failed start does not throw`(): Unit = runBlocking {
        val holder = ArgusServer(createTestArgusConfig(port = 0))
        holder.start()
        try {
            val blocked = ArgusServer(createTestArgusConfig(port = holder.boundPort))
            assertFailsWith<Throwable> { blocked.start() }
            blocked.stop()
        } finally {
            holder.stop()
        }
    }

    @Test
    fun `stop while the bind is still in flight releases the port`(): Unit = runBlocking {
        val port = ServerSocket(0).use { it.localPort }
        val server = ArgusServer(createTestArgusConfig(port = port))
        coroutineScope {
            // Cancel mid-startup, which is what ArgusHandle.stop() does to its scope.
            val job = launch { runCatching { server.start() } }
            job.cancel()
        }
        server.stopSuspend()
        assertTrue(portIsFree(port), "port $port leaked when stop raced the bind")
    }

    @Test
    fun `a stopped server refuses to restart rather than serving a dead buffer`(): Unit = runBlocking {
        val server = ArgusServer(createTestArgusConfig(port = 0))
        server.start()
        server.stop()
        // stop() closes the ring buffer for good. Rebinding would produce a server that serves
        // HTTP but can never receive another event — fail loudly instead.
        assertFailsWith<IllegalStateException> { server.start() }
    }
}
