package com.lynxal.argus.model

import com.lynxal.logging.LogLevel

internal fun createTestHeader(
    name: String = "X-Request-Id",
    value: String = "req_9f2c31aa",
    redacted: Boolean = false,
): Header = Header(name = name, value = value, redacted = redacted)

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
): HttpRequest = HttpRequest(
    method = method,
    url = url,
    host = host,
    path = path,
    headers = headers,
    bodyPreview = bodyPreview,
    bodyTruncatedTotalBytes = bodyTruncatedTotalBytes,
    contentType = contentType,
    sizeBytes = sizeBytes,
)

internal fun createTestHttpResponse(
    statusCode: Int = 200,
    statusText: String = "OK",
    headers: List<Header> = listOf(createTestHeader(name = "Content-Type", value = "application/json")),
    bodyPreview: String? = """{"ok":true}""",
    bodyTruncatedTotalBytes: Long? = null,
    contentType: String? = "application/json",
    sizeBytes: Long? = 11L,
): HttpResponse = HttpResponse(
    statusCode = statusCode,
    statusText = statusText,
    headers = headers,
    bodyPreview = bodyPreview,
    bodyTruncatedTotalBytes = bodyTruncatedTotalBytes,
    contentType = contentType,
    sizeBytes = sizeBytes,
)

internal fun createTestHttpError(
    throwableClass: String = "java.net.SocketTimeoutException",
    message: String? = "connect timed out",
    stackTrace: String = "java.net.SocketTimeoutException: connect timed out\n\tat ...",
): HttpError = HttpError(
    throwableClass = throwableClass,
    message = message,
    stackTrace = stackTrace,
)

internal fun createTestThrowableInfo(
    className: String = "java.lang.NullPointerException",
    message: String? = "Attempt to invoke virtual method on a null object reference",
    stackTrace: String = "java.lang.NullPointerException\n\tat com.example.OrderRepo.save(OrderRepo.kt:42)",
    cause: ThrowableInfo? = null,
): ThrowableInfo = ThrowableInfo(
    className = className,
    message = message,
    stackTrace = stackTrace,
    cause = cause,
)

internal fun createTestHttpEvent(
    id: String = "evt-http-1",
    timestamp: Long = 1_713_103_327_412L,
    request: HttpRequest = createTestHttpRequest(),
    response: HttpResponse? = createTestHttpResponse(),
    error: HttpError? = null,
    durationMs: Long? = 124L,
): HttpEvent = HttpEvent(
    id = id,
    timestamp = timestamp,
    request = request,
    response = response,
    error = error,
    durationMs = durationMs,
)

internal fun createTestLogEvent(
    id: String = "evt-log-1",
    timestamp: Long = 1_713_103_327_418L,
    level: LogLevel = LogLevel.Info,
    tag: String? = "auth",
    message: String = "Session refreshed · id=9f2c",
    payload: Map<String, String> = emptyMap(),
    throwable: ThrowableInfo? = null,
): LogEvent = LogEvent(
    id = id,
    timestamp = timestamp,
    level = level,
    tag = tag,
    message = message,
    payload = payload,
    throwable = throwable,
)

internal fun createTestCustomEvent(
    id: String = "evt-custom-1",
    timestamp: Long = 1_713_103_327_850L,
    sourceLabel: String = "analytics",
    label: String = "cart.item_added",
    direction: Direction = Direction.NONE,
    payload: String = "sku=SKU-8821 · qty=2 · price=24.50",
    metadata: Map<String, String> = mapOf("sku" to "SKU-8821", "qty" to "2"),
): CustomEvent = CustomEvent(
    id = id,
    timestamp = timestamp,
    sourceLabel = sourceLabel,
    label = label,
    direction = direction,
    payload = payload,
    metadata = metadata,
)
