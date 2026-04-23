package com.lynxal.argus.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
@SerialName("CustomEvent")
public data class CustomEvent(
    override val id: String,
    override val timestamp: Long,
    override val source: EventSource = EventSource.CUSTOM,
    val sourceLabel: String,
    val label: String,
    val direction: Direction,
    val payload: String,
    val metadata: Map<String, String> = emptyMap(),
) : ArgusEvent
