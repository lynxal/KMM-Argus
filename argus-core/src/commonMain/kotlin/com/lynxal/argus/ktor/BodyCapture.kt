@file:OptIn(ExperimentalEncodingApi::class)

package com.lynxal.argus.ktor

import io.ktor.http.ContentType
import io.ktor.http.content.OutgoingContent
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

private const val READ_BUFFER_SIZE: Int = 8 * 1024

internal fun isTextContent(contentType: ContentType?): Boolean {
    if (contentType == null) return false
    if (contentType.match(ContentType.Text.Any)) return true
    val app = contentType.contentType.equals("application", ignoreCase = true)
    if (!app) return false
    val sub = contentType.contentSubtype.lowercase()
    return sub == "json" ||
        sub == "xml" ||
        sub == "javascript" ||
        sub == "x-www-form-urlencoded" ||
        sub.endsWith("+json") ||
        sub.endsWith("+xml")
}

internal fun encodeCapturedBytes(
    bytes: ByteArray,
    contentType: ContentType?,
    totalSize: Long,
    maxBytes: Long,
): CapturedBody {
    val truncated = totalSize > maxBytes
    val preview = if (isTextContent(contentType)) {
        bytes.decodeToString()
    } else {
        Base64.encode(bytes)
    }
    return CapturedBody(
        preview = preview,
        truncatedTotalBytes = if (truncated) totalSize else null,
        contentType = contentType?.toString(),
        sizeBytes = totalSize,
    )
}

internal suspend fun ByteReadChannel.drainWithCap(maxBytes: Long): Pair<ByteArray, Long> {
    var total = 0L
    val cap = maxBytes.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    val capture = ArrayList<Byte>(minOf(cap, 64 * 1024))
    val buf = ByteArray(READ_BUFFER_SIZE)
    while (!isClosedForRead) {
        val read = readAvailable(buf, 0, buf.size)
        if (read < 0) break
        if (read == 0) continue
        val remainingCap = (cap - capture.size).coerceAtLeast(0)
        if (remainingCap > 0) {
            val toCopy = minOf(read, remainingCap)
            repeat(toCopy) { i -> capture.add(buf[i]) }
        }
        total += read
    }
    return capture.toByteArray() to total
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
            encodeCapturedBytes(capped, ct, totalSize, maxBytes)
        }
        is ByteArray -> {
            val totalSize = content.size.toLong()
            val capped = if (content.size <= maxBytes) content else content.copyOf(maxBytes.toInt())
            encodeCapturedBytes(capped, contentTypeHint, totalSize, maxBytes)
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
            encodeCapturedBytes(capped, ct, totalSize, maxBytes)
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
