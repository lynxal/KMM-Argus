package com.lynxal.argus.model

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HeaderSerializationTest {

    private val json = Json { encodeDefaults = true }

    @Test
    fun `default Header omits redacted flag from equality but encodes it`() {
        val header = Header(name = "X-Request-Id", value = "req_9f2c31aa")

        val encoded = json.encodeToString(Header.serializer(), header)
        val decoded = json.decodeFromString<Header>(encoded)

        assertEquals(header, decoded)
        assertEquals(false, decoded.redacted)
        assertTrue(encoded.contains("\"redacted\":false"))
    }

    @Test
    fun `redacted Header preserves the flag`() {
        val header = Header(name = "Authorization", value = "***redacted***", redacted = true)

        val decoded = json.decodeFromString<Header>(json.encodeToString(Header.serializer(), header))

        assertEquals(true, decoded.redacted)
        assertEquals("***redacted***", decoded.value)
    }
}
