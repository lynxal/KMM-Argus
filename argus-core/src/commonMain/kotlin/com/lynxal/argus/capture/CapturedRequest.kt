package com.lynxal.argus.capture

import com.lynxal.argus.model.Header
import com.lynxal.argus.model.HttpRequest

@InternalArgusApi
public data class CapturedRequest(
    val method: String,
    val url: String,
    val host: String,
    val path: String,
    val headers: List<Header>,
    val body: CapturedBody?,
) {
    public fun toHttpRequest(): HttpRequest = HttpRequest(
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
