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
    /**
     * Shared by every hop of one logical request, so a redirect chain can be
     * recognised as one call instead of several unrelated ones. Hops of a chain
     * are not necessarily adjacent in the stream — other traffic is emitted
     * between them — so consumers group on this rather than on position.
     *
     * Null for engines that emit a single event per logical request
     * (`argus-okhttp`, `argus-urlconnection`), where a group would hold one hop.
     */
    val requestGroupId: String? = null,
) : ArgusEvent
