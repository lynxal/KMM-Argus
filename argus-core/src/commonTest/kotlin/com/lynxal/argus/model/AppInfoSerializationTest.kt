package com.lynxal.argus.model

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AppInfoSerializationTest {

    private val json = Json { encodeDefaults = true }

    @Test
    fun `AppInfo round-trips`() {
        val info = createTestAppInfo()

        val decoded = json.decodeFromString<AppInfo>(json.encodeToString(AppInfo.serializer(), info))

        assertEquals(info, decoded)
    }

    @Test
    fun `AppInfo encodes all four fields`() {
        val info = createTestAppInfo(
            pkg = "com.lynxal.canvas",
            versionName = "2.0.0",
            device = "iPhone 15 Pro",
            argusVersion = "0.2.1",
        )

        val encoded = json.encodeToString(AppInfo.serializer(), info)

        assertTrue(encoded.contains("\"pkg\":\"com.lynxal.canvas\""))
        assertTrue(encoded.contains("\"versionName\":\"2.0.0\""))
        assertTrue(encoded.contains("\"device\":\"iPhone 15 Pro\""))
        assertTrue(encoded.contains("\"argusVersion\":\"0.2.1\""))
    }
}
