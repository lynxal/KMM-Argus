package com.lynxal.argus.webui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class ArgusUiBundleTest {

    @Test
    fun files_isNonEmpty() {
        assertTrue(ArgusUiBundle.files.isNotEmpty(), "bundle is empty; generator likely broken")
    }

    @Test
    fun get_returnsBundleForIndexHtml() {
        val entry = assertNotNull(ArgusUiBundle.get("/index.html"))
        assertEquals("text/html; charset=utf-8", entry.contentType)
        assertTrue(entry.bytes.isNotEmpty())
    }

    @Test
    fun get_trailingSlashFallsBackToIndex() {
        val root = assertNotNull(ArgusUiBundle.get("/"))
        val nested = assertNotNull(ArgusUiBundle.get("/settings/"))
        val index = assertNotNull(ArgusUiBundle.get("/index.html"))
        assertSame(index, root)
        assertSame(index, nested)
    }

    @Test
    fun get_extensionlessPathFallsBackToIndex() {
        val foo = assertNotNull(ArgusUiBundle.get("/foo"))
        val inspector = assertNotNull(ArgusUiBundle.get("/inspector"))
        val index = assertNotNull(ArgusUiBundle.get("/index.html"))
        assertSame(index, foo)
        assertSame(index, inspector)
    }

    @Test
    fun get_missingAssetReturnsNull() {
        assertNull(ArgusUiBundle.get("/missing.png"))
        assertNull(ArgusUiBundle.get("/does/not/exist.js"))
    }

    @Test
    fun bytes_isStableAcrossCalls() {
        val entry = assertNotNull(ArgusUiBundle.get("/index.html"))
        val first = entry.bytes
        val second = entry.bytes
        assertTrue(first.contentEquals(second))
    }

    @Test
    fun keys_allStartWithLeadingSlash() {
        for (key in ArgusUiBundle.files.keys) {
            assertTrue(key.startsWith("/"), "key missing leading slash: $key")
        }
    }
}
