package com.lynxal.argus.android

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class AppInfoBuilderTest {

    private val context get() = RuntimeEnvironment.getApplication()

    @Test
    fun `populates pkg from context`() {
        val info = AppInfoBuilder.from(context)
        assertEquals(context.packageName, info.pkg)
    }

    @Test
    fun `populates argusVersion from BuildConfig`() {
        val info = AppInfoBuilder.from(context)
        assertEquals(BuildConfig.ARGUS_VERSION, info.argusVersion)
    }

    @Test
    fun `populates device with manufacturer and model`() {
        val info = AppInfoBuilder.from(context)
        assertNotNull(info.device)
        assertTrue(info.device.isNotBlank())
    }

    @Test
    fun `populates versionName non-null`() {
        val info = AppInfoBuilder.from(context)
        assertNotNull(info.versionName)
    }
}
