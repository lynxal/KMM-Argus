package com.lynxal.argus.urlconnection

import java.io.ByteArrayOutputStream
import java.io.FilterInputStream
import java.io.FilterOutputStream
import java.io.InputStream
import java.io.OutputStream

/** Initial buffer size for capture; grows up to [cap]. */
private const val INITIAL_CAPACITY = 8 * 1024

internal class TeeOutputStream(
    delegate: OutputStream,
    private val cap: Long,
) : FilterOutputStream(delegate) {
    private val capture = ByteArrayOutputStream(minOf(cap, INITIAL_CAPACITY.toLong()).toInt())
    private var totalWritten = 0L

    val totalBytesWritten: Long get() = totalWritten
    val capturedBytes: ByteArray get() = capture.toByteArray()

    override fun write(b: Int) {
        if (capture.size().toLong() < cap) {
            capture.write(b)
        }
        totalWritten++
        out.write(b)
    }

    override fun write(b: ByteArray, off: Int, len: Int) {
        val room = cap - capture.size().toLong()
        if (room > 0) {
            val toCopy = minOf(room, len.toLong()).toInt()
            capture.write(b, off, toCopy)
        }
        totalWritten += len
        out.write(b, off, len)
    }
}

internal class TeeInputStream(
    delegate: InputStream,
    private val cap: Long,
    private val onComplete: (bytes: ByteArray, totalRead: Long, eofReached: Boolean) -> Unit,
) : FilterInputStream(delegate) {
    private val capture = ByteArrayOutputStream(minOf(cap, INITIAL_CAPACITY.toLong()).toInt())
    private var totalRead = 0L
    private var emitted = false
    private var eofReached = false

    override fun read(): Int {
        val b = `in`.read()
        if (b == -1) {
            eofReached = true
            emit()
            return -1
        }
        if (capture.size().toLong() < cap) {
            capture.write(b)
        }
        totalRead++
        return b
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        val n = `in`.read(b, off, len)
        if (n == -1) {
            eofReached = true
            emit()
            return -1
        }
        val room = cap - capture.size().toLong()
        if (room > 0) {
            val toCopy = minOf(room, n.toLong()).toInt()
            capture.write(b, off, toCopy)
        }
        totalRead += n
        return n
    }

    override fun close() {
        emit()
        super.close()
    }

    private fun emit() {
        if (emitted) return
        emitted = true
        onComplete(capture.toByteArray(), totalRead, eofReached)
    }
}
