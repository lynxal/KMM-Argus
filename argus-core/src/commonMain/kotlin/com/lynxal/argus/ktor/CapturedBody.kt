package com.lynxal.argus.ktor

internal data class CapturedBody(
    val preview: String?,
    val truncatedTotalBytes: Long?,
    val contentType: String?,
    val sizeBytes: Long?,
)
