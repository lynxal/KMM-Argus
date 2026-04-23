package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public enum class EventSource {
    HTTP,
    LOG,
    CUSTOM,
}
