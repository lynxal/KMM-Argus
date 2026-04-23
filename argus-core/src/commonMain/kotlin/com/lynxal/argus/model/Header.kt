package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public data class Header(
    val name: String,
    val value: String,
    val redacted: Boolean = false,
)
