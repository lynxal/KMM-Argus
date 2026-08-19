package com.lynxal.argus.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ArgusEventSerializationTest {

    private val json = Json {
        encodeDefaults = true
        classDiscriminator = "type"
    }

    @Test
    fun `HttpEvent round-trips polymorphically with type discriminator`() {
        val event: ArgusEvent = createTestHttpEvent()

        val encoded = json.encodeToString<ArgusEvent>(event)
        val decoded = json.decodeFromString<ArgusEvent>(encoded)

        assertTrue(encoded.contains("\"type\":\"HttpEvent\""), "expected 'type' discriminator in: $encoded")
        assertEquals(event, decoded)
    }

    @Test
    fun `LogEvent round-trips polymorphically with type discriminator`() {
        val event: ArgusEvent = createTestLogEvent()

        val encoded = json.encodeToString<ArgusEvent>(event)
        val decoded = json.decodeFromString<ArgusEvent>(encoded)

        assertTrue(encoded.contains("\"type\":\"LogEvent\""), "expected 'type' discriminator in: $encoded")
        assertEquals(event, decoded)
    }

    @Test
    fun `CustomEvent round-trips polymorphically with type discriminator`() {
        val event: ArgusEvent = createTestCustomEvent()

        val encoded = json.encodeToString<ArgusEvent>(event)
        val decoded = json.decodeFromString<ArgusEvent>(encoded)

        assertTrue(encoded.contains("\"type\":\"CustomEvent\""), "expected 'type' discriminator in: $encoded")
        assertEquals(event, decoded)
    }

    @Test
    fun `HttpEvent round-trips requestGroupId`() {
        val event: ArgusEvent = createTestHttpEvent(requestGroupId = "grp-9f2c31aa")

        val encoded = json.encodeToString<ArgusEvent>(event)
        val decoded = json.decodeFromString<ArgusEvent>(encoded)

        assertTrue(
            encoded.contains("\"requestGroupId\":\"grp-9f2c31aa\""),
            "expected requestGroupId on the wire in: $encoded",
        )
        assertEquals(event, decoded)
    }

    @Test
    fun `HttpEvent without requestGroupId decodes to null`() {
        // The field was added at ARGUS_SCHEMA_VERSION 2 without a bump because it is
        // additive and optional. This is that claim under test: a payload minted by a
        // library version predating the field still decodes.
        val payload = """
            {
              "type": "HttpEvent",
              "id": "evt-http-1",
              "timestamp": 1713103327412,
              "request": {
                "method": "GET",
                "url": "https://api.example.com/v1/users/self",
                "host": "api.example.com",
                "path": "/v1/users/self",
                "headers": []
              }
            }
        """.trimIndent()

        val decoded = json.decodeFromString<ArgusEvent>(payload)

        assertTrue(decoded is HttpEvent)
        assertEquals(null, decoded.requestGroupId)
    }

    @Test
    fun `HttpEvent with null response and populated error round-trips`() {
        val event: ArgusEvent = createTestHttpEvent(
            response = null,
            error = createTestHttpError(),
            durationMs = null,
        )

        val decoded = json.decodeFromString<ArgusEvent>(json.encodeToString(event))

        assertEquals(event, decoded)
        assertTrue(decoded is HttpEvent)
        assertEquals(null, decoded.response)
        assertEquals("java.net.SocketTimeoutException", decoded.error?.throwableClass)
    }

    @Test
    fun `HttpEvent with populated response and null error round-trips`() {
        val event: ArgusEvent = createTestHttpEvent(
            response = createTestHttpResponse(statusCode = 204, statusText = "No Content"),
            error = null,
        )

        val decoded = json.decodeFromString<ArgusEvent>(json.encodeToString(event))

        assertEquals(event, decoded)
        assertTrue(decoded is HttpEvent)
        assertEquals(204, decoded.response?.statusCode)
        assertEquals(null, decoded.error)
    }

    @Test
    fun `LogEvent with nested ThrowableInfo cause chain round-trips`() {
        val rootCause = createTestThrowableInfo(
            className = "java.lang.IllegalStateException",
            message = "DB connection pool exhausted",
        )
        val top = createTestThrowableInfo(cause = rootCause)
        val event: ArgusEvent = createTestLogEvent(throwable = top)

        val decoded = json.decodeFromString<ArgusEvent>(json.encodeToString(event))

        assertEquals(event, decoded)
        assertTrue(decoded is LogEvent)
        assertEquals("DB connection pool exhausted", decoded.throwable?.cause?.message)
    }

    @Test
    fun `redacted Header preserves flag through round-trip`() {
        val redacted = createTestHeader(name = "Authorization", value = "***redacted***", redacted = true)
        val event: ArgusEvent = createTestHttpEvent(
            request = createTestHttpRequest(headers = listOf(redacted, createTestHeader())),
        )

        val decoded = json.decodeFromString<ArgusEvent>(json.encodeToString(event))

        assertTrue(decoded is HttpEvent)
        val header = decoded.request.headers.first { it.name == "Authorization" }
        assertEquals(true, header.redacted)
        assertEquals("***redacted***", header.value)
    }

    @Test
    fun `source field survives round-trip alongside type discriminator`() {
        val event: ArgusEvent = createTestCustomEvent()

        val encoded = json.encodeToString<ArgusEvent>(event)

        assertTrue(encoded.contains("\"type\":\"CustomEvent\""))
        assertTrue(encoded.contains("\"source\":\"CUSTOM\""))
    }
}
