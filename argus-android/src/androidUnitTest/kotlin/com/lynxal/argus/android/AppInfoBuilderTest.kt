package com.lynxal.argus.android

import com.lynxal.argus.model.ArgusBuildKonfig
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

    // assertEquals is a wiring check: it fails if someone reintroduces a literal
    // instead of reading the generated constant. The semver check is the real
    // assertion. Agreement with gradle.properties is enforced by
    // :verifyVersionPins, which a unit test cannot do -- it can't read the property.
    @Test
    fun `populates argusVersion from the generated constant`() {
        val info = AppInfoBuilder.from(context)
        assertEquals(ArgusBuildKonfig.ARGUS_VERSION, info.argusVersion)
        assertTrue(
            Regex("""\d+\.\d+\.\d+""").matches(info.argusVersion),
            "argusVersion is not semver: ${info.argusVersion}",
        )
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
