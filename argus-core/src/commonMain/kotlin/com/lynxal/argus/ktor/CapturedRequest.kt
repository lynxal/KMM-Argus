package com.lynxal.argus.ktor

import com.lynxal.argus.model.Header
import com.lynxal.argus.model.HttpRequest

internal data class CapturedRequest(
    val method: String,
    val url: String,
    val host: String,
    val path: String,
    val headers: List<Header>,
    val body: CapturedBody?,
) {
    fun toHttpRequest(): HttpRequest = HttpRequest(
        method = method,
        url = url,
        host = host,
        path = path,
        headers = headers,
        bodyPreview = body?.preview,
        bodyTruncatedTotalBytes = body?.truncatedTotalBytes,
        contentType = body?.contentType,
        sizeBytes = body?.sizeBytes,
    )
}
