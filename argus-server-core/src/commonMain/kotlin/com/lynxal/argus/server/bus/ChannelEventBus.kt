package com.lynxal.argus.server.bus

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.server.buffer.EventRingBuffer

/**
 * [ArgusEventBus] implementation backed by an [EventRingBuffer].
 *
 * Delegates every [publish] to the buffer's unbounded inbox channel, so publishers
 * are never blocked — satisfying the non-suspend [ArgusEventBus.publish] contract
 * for the already-shipped Ktor client plugin and KMMLogging delegate.
 */
public class ChannelEventBus internal constructor(
    private val buffer: EventRingBuffer,
) : ArgusEventBus {

    override fun publish(event: ArgusEvent) {
        buffer.offer(event)
    }
}
