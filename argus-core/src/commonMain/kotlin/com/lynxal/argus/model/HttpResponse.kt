package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public data class HttpResponse(
    val statusCode: Int,
    val statusText: String,
    val headers: List<Header>,
    val bodyPreview: String? = null,
    val bodyTruncatedTotalBytes: Long? = null,
    val contentType: String? = null,
    val sizeBytes: Long? = null,
)
