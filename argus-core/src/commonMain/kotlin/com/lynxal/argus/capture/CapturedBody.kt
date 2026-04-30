package com.lynxal.argus.capture

@InternalArgusApi
public data class CapturedBody(
    val preview: String?,
    val truncatedTotalBytes: Long?,
    val contentType: String?,
    val sizeBytes: Long?,
)
