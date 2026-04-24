package com.lynxal.argus.webui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ContentTypeTest {

    @Test
    fun html_isServedAsUtf8Html() {
        val html = ArgusUiBundle.files.filterKeys { it.endsWith(".html") }
        assertTrue(html.isNotEmpty(), "expected at least one .html asset")
        for ((_, entry) in html) {
            assertEquals("text/html; charset=utf-8", entry.contentType)
        }
    }

    @Test
    fun js_isServedAsUtf8Javascript() {
        val js = ArgusUiBundle.files.filterKeys { it.endsWith(".js") }
        assertTrue(js.isNotEmpty(), "expected at least one .js asset")
        for ((_, entry) in js) {
            assertEquals("application/javascript; charset=utf-8", entry.contentType)
        }
    }

    @Test
    fun css_isServedAsUtf8Css() {
        val css = ArgusUiBundle.files.filterKeys { it.endsWith(".css") }
        assertTrue(css.isNotEmpty(), "expected at least one .css asset")
        for ((_, entry) in css) {
            assertEquals("text/css; charset=utf-8", entry.contentType)
        }
    }

    @Test
    fun woff2_isServedAsFontWoff2() {
        val woff2 = ArgusUiBundle.files.filterKeys { it.endsWith(".woff2") }
        assertTrue(woff2.isNotEmpty(), "expected at least one .woff2 asset")
        for ((_, entry) in woff2) {
            assertEquals("font/woff2", entry.contentType)
        }
    }
}
