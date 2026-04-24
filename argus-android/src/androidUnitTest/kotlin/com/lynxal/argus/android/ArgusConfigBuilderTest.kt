package com.lynxal.argus.android

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.server.DEFAULT_REDACTED_HEADERS
import kotlin.test.Test
import kotlin.test.assertEquals

class ArgusConfigBuilderTest {

    private val sampleAppInfo = AppInfo(
        pkg = "com.example.test",
        versionName = "1.0",
        device = "Test Device",
        argusVersion = "0.1.0",
    )

    @Test
    fun `defaults match server-core ArgusConfig defaults`() {
        val config = ArgusConfigBuilder(sampleAppInfo).build()
        assertEquals(sampleAppInfo, config.appInfo)
        assertEquals(500, config.maxEvents)
        assertEquals(1_000_000L, config.maxBodyBytes)
        assertEquals(DEFAULT_REDACTED_HEADERS, config.redactHeaders)
        assertEquals(listOf("http://localhost:5173"), config.corsDevOrigins)
    }

    @Test
    fun `overrides flow through to built config`() {
        val config = ArgusConfigBuilder(sampleAppInfo).apply {
            maxEvents = 100
            maxBodyBytes = 262_144L
            redactHeaders = setOf("X-Custom")
            corsDevOrigins = emptyList()
        }.build()

        assertEquals(100, config.maxEvents)
        assertEquals(262_144L, config.maxBodyBytes)
        assertEquals(setOf("X-Custom"), config.redactHeaders)
        assertEquals(emptyList(), config.corsDevOrigins)
    }

    @Test
    fun `appInfo is not mutable from builder`() {
        val config = ArgusConfigBuilder(sampleAppInfo).apply {
            maxEvents = 42
        }.build()
        assertEquals(sampleAppInfo, config.appInfo)
    }
}
