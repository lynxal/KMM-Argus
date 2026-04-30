@file:OptIn(ExperimentalEncodingApi::class)

package com.lynxal.argus.capture

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

@InternalArgusApi
public fun isTextContent(mime: String?): Boolean {
    if (mime.isNullOrEmpty()) return false
    val main = mime.substringBefore(';').trim().lowercase()
    if (main.startsWith("text/")) return true
    if (!main.startsWith("application/")) return false
    val sub = main.removePrefix("application/")
    return sub == "json" ||
        sub == "xml" ||
        sub == "javascript" ||
        sub == "x-www-form-urlencoded" ||
        sub.endsWith("+json") ||
        sub.endsWith("+xml")
}

@InternalArgusApi
public fun encodeCapturedBytes(
    bytes: ByteArray,
    contentType: String?,
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
        contentType = contentType,
        sizeBytes = totalSize,
    )
}
