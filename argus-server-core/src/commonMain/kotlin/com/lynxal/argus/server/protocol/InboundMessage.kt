package com.lynxal.argus.server.protocol

import com.lynxal.argus.server.filter.EventFilter
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Control messages a `/ws` client may send. Optional — clients that send
 * nothing receive every event.
 *
 *   {"type":"subscribe","filter":{...}}
 */
@Serializable
public sealed interface InboundMessage {

    @Serializable
    @SerialName("subscribe")
    public data class Subscribe(val filter: EventFilter) : InboundMessage
}
