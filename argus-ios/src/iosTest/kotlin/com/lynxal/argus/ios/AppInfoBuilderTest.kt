package com.lynxal.argus.ios

import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AppInfoBuilderTest {

    @Test
    fun `build returns non-null AppInfo with argus version`() {
        val info = AppInfoBuilder.build()
        assertNotNull(info.pkg)
        assertNotNull(info.versionName)
        assertNotNull(info.device)
        assertTrue(info.argusVersion.isNotBlank())
    }
}
