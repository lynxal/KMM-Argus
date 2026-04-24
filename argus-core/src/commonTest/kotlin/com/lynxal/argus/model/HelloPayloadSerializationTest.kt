package com.lynxal.argus.model

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HelloPayloadSerializationTest {

    private val json = Json { encodeDefaults = true }

    @Test
    fun `default HelloPayload carries ARGUS_SCHEMA_VERSION`() {
        val payload = HelloPayload()

        assertEquals(ARGUS_SCHEMA_VERSION, payload.schemaVersion)
    }

    @Test
    fun `default HelloPayload round-trips`() {
        val payload = HelloPayload()

        val decoded = json.decodeFromString<HelloPayload>(json.encodeToString(HelloPayload.serializer(), payload))

        assertEquals(payload, decoded)
        assertEquals(ARGUS_SCHEMA_VERSION, decoded.schemaVersion)
        assertEquals("argus", decoded.serverName)
        assertEquals(null, decoded.serverVersion)
    }

    @Test
    fun `HelloPayload with explicit overrides round-trips`() {
        val payload = HelloPayload(
            schemaVersion = 42,
            serverName = "argus-staging",
            serverVersion = "0.3.1",
        )

        val encoded = json.encodeToString(HelloPayload.serializer(), payload)
        val decoded = json.decodeFromString<HelloPayload>(encoded)

        assertEquals(payload, decoded)
        assertTrue(encoded.contains("\"schemaVersion\":42"))
        assertTrue(encoded.contains("\"serverVersion\":\"0.3.1\""))
    }

    @Test
    fun `HelloPayload with appInfo round-trips`() {
        val payload = HelloPayload(appInfo = createTestAppInfo())

        val encoded = json.encodeToString(HelloPayload.serializer(), payload)
        val decoded = json.decodeFromString<HelloPayload>(encoded)

        assertEquals(payload, decoded)
        assertEquals(createTestAppInfo(), decoded.appInfo)
    }

    @Test
    fun `HelloPayload decodes legacy payload without appInfo`() {
        val legacy = """{"schemaVersion":1,"serverName":"argus","serverVersion":null}"""

        val decoded = Json.decodeFromString<HelloPayload>(legacy)

        assertEquals(null, decoded.appInfo)
        assertEquals(ARGUS_SCHEMA_VERSION, decoded.schemaVersion)
    }
}
