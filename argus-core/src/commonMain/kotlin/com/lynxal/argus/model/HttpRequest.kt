package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public data class HttpRequest(
    val method: String,
    val url: String,
    val host: String,
    val path: String,
    val headers: List<Header>,
    val bodyPreview: String? = null,
    val bodyTruncatedTotalBytes: Long? = null,
    val contentType: String? = null,
    val sizeBytes: Long? = null,
)
