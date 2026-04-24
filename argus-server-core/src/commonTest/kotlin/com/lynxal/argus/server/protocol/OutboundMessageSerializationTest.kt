package com.lynxal.argus.server.protocol

import com.lynxal.argus.model.ARGUS_SCHEMA_VERSION
import com.lynxal.argus.server.createTestAppInfo
import com.lynxal.argus.server.createTestEventFilter
import com.lynxal.argus.server.createTestHttpEvent
import com.lynxal.argus.server.filter.EventFilter
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OutboundMessageSerializationTest {

    private val json = Json {
        classDiscriminator = "type"
        encodeDefaults = true
        explicitNulls = false
    }

    @Test
    fun `Hello encodes with type discriminator and info payload`() {
        val msg: OutboundMessage = OutboundMessage.Hello(createTestAppInfo(), ARGUS_SCHEMA_VERSION)

        val encoded = json.encodeToString(OutboundMessage.serializer(), msg)

        assertTrue(encoded.contains("\"type\":\"hello\""), encoded)
        assertTrue(encoded.contains("\"schemaVersion\":1"), encoded)
        assertTrue(encoded.contains("\"pkg\":\"com.example.canvas\""), encoded)
    }

    @Test
    fun `Hello round-trips`() {
        val msg: OutboundMessage = OutboundMessage.Hello(createTestAppInfo(), ARGUS_SCHEMA_VERSION)

        val decoded = json.decodeFromString(OutboundMessage.serializer(), json.encodeToString(OutboundMessage.serializer(), msg))

        assertEquals(msg, decoded)
    }

    @Test
    fun `Event encodes with nested event type discriminator`() {
        val msg: OutboundMessage = OutboundMessage.Event(createTestHttpEvent())

        val encoded = json.encodeToString(OutboundMessage.serializer(), msg)

        assertTrue(encoded.contains("\"type\":\"event\""), encoded)
        assertTrue(encoded.contains("\"type\":\"HttpEvent\""), encoded)
    }

    @Test
    fun `Event round-trips`() {
        val msg: OutboundMessage = OutboundMessage.Event(createTestHttpEvent())

        val decoded = json.decodeFromString(OutboundMessage.serializer(), json.encodeToString(OutboundMessage.serializer(), msg))

        assertEquals(msg, decoded)
    }

    @Test
    fun `Cleared encodes as type-only object`() {
        val msg: OutboundMessage = OutboundMessage.Cleared

        val encoded = json.encodeToString(OutboundMessage.serializer(), msg)

        assertEquals("""{"type":"cleared"}""", encoded)
    }

    @Test
    fun `Cleared round-trips`() {
        val msg: OutboundMessage = OutboundMessage.Cleared

        val decoded = json.decodeFromString(OutboundMessage.serializer(), json.encodeToString(OutboundMessage.serializer(), msg))

        assertEquals(OutboundMessage.Cleared, decoded)
    }

    @Test
    fun `Subscribe inbound message round-trips with embedded filter`() {
        val msg: InboundMessage = InboundMessage.Subscribe(createTestEventFilter(method = "GET"))

        val encoded = json.encodeToString(InboundMessage.serializer(), msg)
        val decoded = json.decodeFromString(InboundMessage.serializer(), encoded)

        assertTrue(encoded.contains("\"type\":\"subscribe\""))
        assertEquals(msg, decoded)
        assertEquals(EventFilter(method = "GET"), (decoded as InboundMessage.Subscribe).filter)
    }
}
