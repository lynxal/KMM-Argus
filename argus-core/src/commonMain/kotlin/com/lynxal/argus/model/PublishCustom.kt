@file:OptIn(ExperimentalUuidApi::class, ExperimentalTime::class)

package com.lynxal.argus.model

import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Emit a [CustomEvent] onto this bus. Convenience over hand-building the event:
 * generates the id, stamps the current time, and forwards to [ArgusEventBus.publish].
 *
 * @param source label identifying the emitting subsystem (e.g. `"analytics"`,
 *               `"ble-mesh"`). Maps onto [CustomEvent.sourceLabel] and is what the
 *               WebUI's source-label filter discovers from the live stream.
 */
public fun ArgusEventBus.publishCustom(
    source: String,
    label: String,
    direction: Direction,
    payload: String,
    metadata: Map<String, String> = emptyMap(),
) {
    publish(
        CustomEvent(
            id = Uuid.random().toString(),
            timestamp = Clock.System.now().toEpochMilliseconds(),
            sourceLabel = source,
            label = label,
            direction = direction,
            payload = payload,
            metadata = metadata,
        ),
    )
}
