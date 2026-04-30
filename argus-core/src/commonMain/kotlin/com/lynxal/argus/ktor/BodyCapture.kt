@file:OptIn(InternalArgusApi::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.capture.CapturedBody
import com.lynxal.argus.capture.InternalArgusApi
import com.lynxal.argus.capture.encodeCapturedBytes
import io.ktor.http.ContentType
import io.ktor.http.content.OutgoingContent
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable

private const val READ_BUFFER_SIZE: Int = 8 * 1024

internal suspend fun ByteReadChannel.drainWithCap(maxBytes: Long): Pair<ByteArray, Long> {
    var total = 0L
    val cap = maxBytes.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    var capture = ByteArray(minOf(cap, 64 * 1024))
    var captureSize = 0
    val buf = ByteArray(READ_BUFFER_SIZE)
    while (!isClosedForRead) {
        val read = readAvailable(buf, 0, buf.size)
        if (read < 0) break
        if (read == 0) continue
        val remainingCap = (cap - captureSize).coerceAtLeast(0)
        if (remainingCap > 0) {
            val toCopy = minOf(read, remainingCap)
            if (captureSize + toCopy > capture.size) {
                val newSize = ((captureSize + toCopy) * 2).coerceAtMost(cap)
                capture = capture.copyOf(newSize)
            }
            buf.copyInto(capture, captureSize, 0, toCopy)
            captureSize += toCopy
        }
        total += read
    }
    return capture.copyOf(captureSize) to total
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
