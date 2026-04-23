package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public data class ThrowableInfo(
    val className: String,
    val message: String?,
    val stackTrace: String,
    val cause: ThrowableInfo? = null,
)
