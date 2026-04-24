package com.lynxal.argus.server

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.model.CustomEvent
import com.lynxal.argus.model.Direction
import com.lynxal.argus.model.Header
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.HttpRequest
import com.lynxal.argus.model.HttpResponse
import com.lynxal.argus.model.LogEvent
import com.lynxal.argus.server.filter.EventFilter
import com.lynxal.logging.LogLevel

internal fun createTestAppInfo(
    pkg: String = "com.example.canvas",
    versionName: String = "1.4.2",
    device: String = "Pixel 7 Pro",
    argusVersion: String = "0.1.0",
): AppInfo = AppInfo(pkg, versionName, device, argusVersion)

internal fun createTestArgusConfig(
    appInfo: AppInfo = createTestAppInfo(),
    maxEvents: Int = 500,
    corsDevOrigins: List<String> = emptyList(),
): ArgusConfig = ArgusConfig(
    appInfo = appInfo,
    maxEvents = maxEvents,
    corsDevOrigins = corsDevOrigins,
)

internal fun createTestEventFilter(
    source: com.lynxal.argus.model.EventSource? = null,
    method: String? = null,
    statusClass: Int? = null,
    host: String? = null,
    urlContains: String? = null,
    logLevel: String? = null,
    tag: String? = null,
): EventFilter = EventFilter(source, method, statusClass, host, urlContains, logLevel, tag)

internal fun createTestHeader(
    name: String = "X-Request-Id",
    value: String = "req_9f2c31aa",
    redacted: Boolean = false,
): Header = Header(name, value, redacted)

internal fun createTestHttpRequest(
    method: String = "GET",
    url: String = "https://api.example.com/v1/users/self",
    host: String = "api.example.com",
    path: String = "/v1/users/self",
    headers: List<Header> = listOf(createTestHeader()),
    bodyPreview: String? = null,
    bodyTruncatedTotalBytes: Long? = null,
    contentType: String? = "application/json",
    sizeBytes: Long? = 0L,
): HttpRequest = HttpRequest(method, url, host, path, headers, bodyPreview, bodyTruncatedTotalBytes, contentType, sizeBytes)

internal fun createTestHttpResponse(
    statusCode: Int = 200,
    statusText: String = "OK",
    headers: List<Header> = listOf(createTestHeader("Content-Type", "application/json")),
    bodyPreview: String? = """{"ok":true}""",
    bodyTruncatedTotalBytes: Long? = null,
    contentType: String? = "application/json",
    sizeBytes: Long? = 11L,
): HttpResponse = HttpResponse(statusCode, statusText, headers, bodyPreview, bodyTruncatedTotalBytes, contentType, sizeBytes)

internal fun createTestHttpEvent(
    id: String = "evt-http-1",
    timestamp: Long = 1_713_103_327_412L,
    request: HttpRequest = createTestHttpRequest(),
    response: HttpResponse? = createTestHttpResponse(),
    durationMs: Long? = 124L,
): HttpEvent = HttpEvent(
    id = id,
    timestamp = timestamp,
    request = request,
    response = response,
    durationMs = durationMs,
)

internal fun createTestLogEvent(
    id: String = "evt-log-1",
    timestamp: Long = 1_713_103_327_418L,
    level: LogLevel = LogLevel.Info,
    tag: String? = "auth",
    message: String = "Session refreshed",
    payload: Map<String, String> = emptyMap(),
): LogEvent = LogEvent(
    id = id,
    timestamp = timestamp,
    level = level,
    tag = tag,
    message = message,
    payload = payload,
)

internal fun createTestCustomEvent(
    id: String = "evt-custom-1",
    timestamp: Long = 1_713_103_327_850L,
    sourceLabel: String = "analytics",
    label: String = "cart.item_added",
    direction: Direction = Direction.NONE,
    payload: String = "sku=SKU-8821",
    metadata: Map<String, String> = emptyMap(),
): CustomEvent = CustomEvent(id, timestamp, sourceLabel = sourceLabel, label = label, direction = direction, payload = payload, metadata = metadata)
