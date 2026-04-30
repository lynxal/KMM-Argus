package com.lynxal.argus.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

private class RecordingBus : ArgusEventBus {
    val events: MutableList<ArgusEvent> = mutableListOf()
    override fun publish(event: ArgusEvent) {
        events.add(event)
    }
}

class PublishCustomTest {

    @Test
    fun `publishCustom maps source onto sourceLabel and forwards every field`() {
        val bus = RecordingBus()

        bus.publishCustom(
            source = "analytics",
            label = "cart.item_added",
            direction = Direction.OUTBOUND,
            payload = "sku=SKU-8821",
            metadata = mapOf("sku" to "SKU-8821"),
        )

        assertEquals(1, bus.events.size)
        val emitted = bus.events.single() as CustomEvent
        assertEquals("analytics", emitted.sourceLabel)
        assertEquals("cart.item_added", emitted.label)
        assertEquals(Direction.OUTBOUND, emitted.direction)
        assertEquals("sku=SKU-8821", emitted.payload)
        assertEquals(mapOf("sku" to "SKU-8821"), emitted.metadata)
        assertTrue(emitted.id.isNotBlank())
        assertTrue(emitted.timestamp > 0L)
    }

    @Test
    fun `publishCustom defaults metadata to empty map when omitted`() {
        val bus = RecordingBus()

        bus.publishCustom(
            source = "ble-mesh",
            label = "node.online",
            direction = Direction.NONE,
            payload = "addr=0x1A2B",
        )

        val emitted = bus.events.single() as CustomEvent
        assertEquals(emptyMap(), emitted.metadata)
    }

    @Test
    fun `publishCustom assigns unique ids across calls`() {
        val bus = RecordingBus()
        repeat(3) { i ->
            bus.publishCustom(
                source = "x",
                label = "n$i",
                direction = Direction.NONE,
                payload = "",
            )
        }
        val ids = bus.events.map { it.id }.toSet()
        assertEquals(3, ids.size)
        ids.forEach { assertNotNull(it) }
    }
}
