package com.lynxal.argus.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
@SerialName("HttpEvent")
public data class HttpEvent(
    override val id: String,
    override val timestamp: Long,
    override val source: EventSource = EventSource.HTTP,
    val request: HttpRequest,
    val response: HttpResponse? = null,
    val error: HttpError? = null,
    val durationMs: Long? = null,
    val correlationId: String? = null,
    val engine: String = "ktor",
) : ArgusEvent
