@file:OptIn(InternalArgusApi::class, InternalAPI::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.capture.CapturedBody
import com.lynxal.argus.capture.InternalArgusApi
import com.lynxal.argus.capture.encodeCapturedBytes
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.content.OutgoingContent
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.InternalAPI
import io.ktor.utils.io.WriterJob
import io.ktor.utils.io.readAvailable
import io.ktor.utils.io.writeFully
import io.ktor.utils.io.writer

private const val READ_BUFFER_SIZE: Int = 8 * 1024

internal data class PrefixRead(
    val bytes: ByteArray,
    val sourceExhausted: Boolean,
)

/**
 * Reads up to [maxBytes] from this channel into a fresh [ByteArray]. Stops as soon
 * as either the cap is reached or the source is closed. The returned
 * [PrefixRead.sourceExhausted] indicates whether the source had any bytes remaining
 * after the read — callers use it to decide whether they still need to stream a tail.
 */
internal suspend fun ByteReadChannel.readPrefix(maxBytes: Long): PrefixRead {
    val cap = maxBytes.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    var buf = ByteArray(minOf(cap, 64 * 1024))
    var size = 0
    val tmp = ByteArray(READ_BUFFER_SIZE)
    while (size < cap && !isClosedForRead) {
        val want = minOf(tmp.size, cap - size)
        val read = readAvailable(tmp, 0, want)
        if (read < 0) break
        if (read == 0) continue
        if (size + read > buf.size) {
            buf = buf.copyOf(((size + read) * 2).coerceAtMost(cap))
        }
        tmp.copyInto(buf, size, 0, read)
        size += read
    }
    return PrefixRead(buf.copyOf(size), sourceExhausted = isClosedForRead)
}

internal class StreamedTail(
    val channel: ByteReadChannel,
    private val tailTotal: () -> Long,
    private val writerJob: WriterJob,
) {
    /** Suspends until the prefix + tail have been fully streamed (or the writer failed),
     *  then returns the total number of source bytes observed (prefix + tail). */
    suspend fun awaitTotal(): Long {
        runCatching { writerJob.job.join() }
        return tailTotal()
    }
}

/**
 * Builds a brand-new [ByteReadChannel] that first emits [prefix], then streams the
 * remainder of [response]'s raw content. The returned channel is owned by this
 * function — no other coroutine reads from it, and it shares no state with the
 * original response channel (other than acting as its sink). The host app reads
 * this new channel; Argus is no longer in the read chain.
 *
 * The returned [StreamedTail.awaitTotal] resolves to the total number of source
 * bytes observed (prefix + tail) once the writer completes — used to populate
 * `bodyTruncatedTotalBytes`.
 */
internal fun streamPrefixedTail(
    response: HttpResponse,
    source: ByteReadChannel,
    prefix: ByteArray,
): StreamedTail {
    var tailTotal = 0L
    val job = response.writer {
        channel.writeFully(prefix)
        val buf = ByteArray(READ_BUFFER_SIZE)
        while (!source.isClosedForRead) {
            val read = source.readAvailable(buf, 0, buf.size)
            if (read < 0) break
            if (read == 0) continue
            channel.writeFully(buf, 0, read)
            tailTotal += read
        }
    }
    return StreamedTail(
        channel = job.channel,
        tailTotal = { prefix.size.toLong() + tailTotal },
        writerJob = job,
    )
}

internal fun captureRequestPayload(
    content: Any?,
    contentTypeHint: ContentType?,
    maxBytes: Long,
): CapturedBody? {
    return when (content) {
        null -> null
        is String -> {
            val bytes = content.encodeToByteArray()
            val totalSize = bytes.size.toLong()
            val ct = contentTypeHint ?: ContentType.Text.Plain
            val capped = if (bytes.size <= maxBytes) bytes else bytes.copyOf(maxBytes.toInt())
            encodeCapturedBytes(capped, ct.toString(), totalSize, maxBytes)
        }
        is ByteArray -> {
            val totalSize = content.size.toLong()
            val capped = if (content.size <= maxBytes) content else content.copyOf(maxBytes.toInt())
            encodeCapturedBytes(capped, contentTypeHint?.toString(), totalSize, maxBytes)
        }
        is OutgoingContent -> captureOutgoingContent(content, contentTypeHint, maxBytes)
        else -> null
    }
}

private fun captureOutgoingContent(
    content: OutgoingContent,
    contentTypeHint: ContentType?,
    maxBytes: Long,
): CapturedBody? {
    val ct = content.contentType ?: contentTypeHint
    val length = content.contentLength
    return when (content) {
        is OutgoingContent.ByteArrayContent -> {
            val bytes = content.bytes()
            val totalSize = bytes.size.toLong()
            val capped = if (bytes.size <= maxBytes) bytes else bytes.copyOf(maxBytes.toInt())
            encodeCapturedBytes(capped, ct?.toString(), totalSize, maxBytes)
        }
        is OutgoingContent.NoContent -> null
        else -> CapturedBody(
            preview = null,
            truncatedTotalBytes = null,
            contentType = ct?.toString(),
            sizeBytes = length,
        )
    }
}
