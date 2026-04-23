package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public data class HttpError(
    val throwableClass: String,
    val message: String?,
    val stackTrace: String,
)
