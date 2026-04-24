package com.lynxal.argus.server.filter

import com.lynxal.argus.model.EventSource
import com.lynxal.argus.server.createTestCustomEvent
import com.lynxal.argus.server.createTestHttpEvent
import com.lynxal.argus.server.createTestHttpRequest
import com.lynxal.argus.server.createTestHttpResponse
import com.lynxal.argus.server.createTestLogEvent
import com.lynxal.logging.LogLevel
import io.ktor.http.parametersOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventFilterTest {

    @Test
    fun `empty filter matches everything`() {
        val filter = EventFilter()

        assertTrue(filter.matches(createTestHttpEvent()))
        assertTrue(filter.matches(createTestLogEvent()))
        assertTrue(filter.matches(createTestCustomEvent()))
    }

    @Test
    fun `source filter matches only that source`() {
        val filter = EventFilter(source = EventSource.HTTP)

        assertTrue(filter.matches(createTestHttpEvent()))
        assertFalse(filter.matches(createTestLogEvent()))
        assertFalse(filter.matches(createTestCustomEvent()))
    }

    @Test
    fun `method filter is case insensitive`() {
        val filter = EventFilter(method = "get")

        assertTrue(filter.matches(createTestHttpEvent(request = createTestHttpRequest(method = "GET"))))
        assertFalse(filter.matches(createTestHttpEvent(request = createTestHttpRequest(method = "POST"))))
    }

    @Test
    fun `method filter rejects non-http events`() {
        val filter = EventFilter(method = "GET")

        assertFalse(filter.matches(createTestLogEvent()))
    }

    @Test
    fun `statusClass 5 matches 5xx responses only`() {
        val filter = EventFilter(statusClass = 5)

        val server500 = createTestHttpEvent(response = createTestHttpResponse(statusCode = 503, statusText = "Service Unavailable"))
        val ok200 = createTestHttpEvent(response = createTestHttpResponse(statusCode = 200))
        val noResponse = createTestHttpEvent(response = null)

        assertTrue(filter.matches(server500))
        assertFalse(filter.matches(ok200))
        assertFalse(filter.matches(noResponse))
    }

    @Test
    fun `host filter matches case insensitively`() {
        val filter = EventFilter(host = "API.EXAMPLE.COM")
        val event = createTestHttpEvent(request = createTestHttpRequest(host = "api.example.com"))

        assertTrue(filter.matches(event))
    }

    @Test
    fun `urlContains filter is case insensitive substring match`() {
        val filter = EventFilter(urlContains = "/users/")
        val match = createTestHttpEvent(request = createTestHttpRequest(url = "https://api.example.com/v1/Users/self"))
        val miss = createTestHttpEvent(request = createTestHttpRequest(url = "https://api.example.com/v1/orders"))

        assertTrue(filter.matches(match))
        assertFalse(filter.matches(miss))
    }

    @Test
    fun `logLevel filter matches only that level`() {
        val filter = EventFilter(logLevel = "Warning")

        val warn = createTestLogEvent(level = LogLevel.Warning)
        val info = createTestLogEvent(level = LogLevel.Info)

        assertTrue(filter.matches(warn))
        assertFalse(filter.matches(info))
    }

    @Test
    fun `logLevel invalid name degrades to non-match`() {
        val filter = EventFilter(logLevel = "NotARealLevel")

        assertFalse(filter.matches(createTestLogEvent()))
    }

    @Test
    fun `tag filter matches only that tag`() {
        val filter = EventFilter(tag = "auth")

        assertTrue(filter.matches(createTestLogEvent(tag = "auth")))
        assertFalse(filter.matches(createTestLogEvent(tag = "payments")))
    }

    @Test
    fun `tag filter rejects non-log events`() {
        val filter = EventFilter(tag = "auth")

        assertFalse(filter.matches(createTestHttpEvent()))
    }

    @Test
    fun `fromParameters returns empty for empty params`() {
        val filter = EventFilter.fromParameters(parametersOf())

        assertEquals(EventFilter(), filter)
    }

    @Test
    fun `fromParameters parses every supported field`() {
        val params = parametersOf(
            "source" to listOf("HTTP"),
            "method" to listOf("POST"),
            "statusClass" to listOf("4"),
            "host" to listOf("api.example.com"),
            "urlContains" to listOf("/users/"),
            "logLevel" to listOf("Info"),
            "tag" to listOf("auth"),
        )

        val filter = EventFilter.fromParameters(params)

        assertEquals(EventSource.HTTP, filter.source)
        assertEquals("POST", filter.method)
        assertEquals(4, filter.statusClass)
        assertEquals("api.example.com", filter.host)
        assertEquals("/users/", filter.urlContains)
        assertEquals("Info", filter.logLevel)
        assertEquals("auth", filter.tag)
    }

    @Test
    fun `fromParameters degrades unknown source to null`() {
        val params = parametersOf("source" to listOf("BOGUS"))

        val filter = EventFilter.fromParameters(params)

        assertEquals(null, filter.source)
    }

    @Test
    fun `fromParameters statusClass outside 1 to 5 becomes null`() {
        val filter = EventFilter.fromParameters(parametersOf("statusClass" to listOf("9")))

        assertEquals(null, filter.statusClass)
    }
}
