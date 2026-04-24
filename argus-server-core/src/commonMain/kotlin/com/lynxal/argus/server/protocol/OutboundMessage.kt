package com.lynxal.argus.server.protocol

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.model.ArgusEvent
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Everything the server sends to a connected `/ws` client.
 *
 * Encoded with `Json { classDiscriminator = "type" }` so the wire format is:
 *
 *   {"type":"hello","info":{...},"schemaVersion":1}
 *   {"type":"event","event":{"type":"HttpEvent",...}}
 *   {"type":"cleared"}
 */
@Serializable
public sealed interface OutboundMessage {

    @Serializable
    @SerialName("hello")
    public data class Hello(
        val info: AppInfo,
        val schemaVersion: Int,
    ) : OutboundMessage

    @Serializable
    @SerialName("event")
    public data class Event(val event: ArgusEvent) : OutboundMessage

    @Serializable
    @SerialName("cleared")
    public data object Cleared : OutboundMessage
}
