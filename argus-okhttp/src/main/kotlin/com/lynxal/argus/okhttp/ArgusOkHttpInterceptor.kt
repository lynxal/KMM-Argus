package com.lynxal.argus.okhttp

import com.lynxal.argus.capture.CaptureConfig
import com.lynxal.argus.capture.CapturedBody
import com.lynxal.argus.capture.CapturedRequest
import com.lynxal.argus.capture.buildRedactedHeaders
import com.lynxal.argus.capture.effectiveMaxBytesFor
import com.lynxal.argus.capture.encodeCapturedBytes
import com.lynxal.argus.correlation.activeCorrelationId
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.HttpError
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.HttpResponse as ArgusHttpResponse
import java.io.IOException
import kotlin.time.Clock
import kotlin.uuid.Uuid
import okhttp3.Headers
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.Buffer

/**
 * Application-level OkHttp interceptor that publishes [HttpEvent] records to the
 * provided [ArgusEventBus]. Mirrors [com.lynxal.argus.ktor.Argus]'s capture surface:
 * header redaction, body cap with optional per-host bypass, correlation-id stamping,
 * and IO-error reporting.
 *
 * Install at application level so the interceptor sees requests as the application
 * built them — adding it as a network interceptor would surface OkHttp's transformed
 * (redirected, retried) requests instead.
 *
 * One known limitation: when the response declares `Content-Length: -1` (chunked),
 * `truncatedTotalBytes` cannot be computed without consuming the full body, so the
 * captured event reports `null` for that field even when the body exceeds the cap.
 */
public class ArgusOkHttpInterceptor(
    private val eventBus: ArgusEventBus,
    private val config: ArgusOkHttpConfig = ArgusOkHttpConfig(),
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val id = Uuid.random().toString()
        val startMs = Clock.System.now().toEpochMilliseconds()
        val correlationId = activeCorrelationId()
        val captureCfg = config.toCaptureConfig()
        val host = originalRequest.url.host
        val effectiveMax = effectiveMaxBytesFor(host, captureCfg)

        val (capturedRequest, sendableRequest) = buildCapturedRequest(
            request = originalRequest,
            effectiveMax = effectiveMax,
            captureRequestBody = config.captureRequestBody,
            redactHeaders = config.redactHeaders,
        )

        val response = try {
            chain.proceed(sendableRequest)
        } catch (t: IOException) {
            emitError(id, startMs, capturedRequest, correlationId, t)
            throw t
        }

        val capturedBody: CapturedBody? = if (config.captureResponseBody) {
            captureResponseBody(response, effectiveMax)
        } else {
            null
        }

        val durationMs = Clock.System.now().toEpochMilliseconds() - startMs
        val argusResponse = ArgusHttpResponse(
            statusCode = response.code,
            statusText = response.message,
            headers = response.headers.toRedactedHeaders(config.redactHeaders),
            bodyPreview = capturedBody?.preview,
            bodyTruncatedTotalBytes = capturedBody?.truncatedTotalBytes,
            contentType = capturedBody?.contentType ?: response.body?.contentType()?.toString(),
            sizeBytes = capturedBody?.sizeBytes ?: response.body?.contentLength()?.takeIf { it >= 0 },
        )

        eventBus.publish(
            HttpEvent(
                id = id,
                timestamp = startMs,
                request = capturedRequest.toHttpRequest(),
                response = argusResponse,
                error = null,
                durationMs = durationMs,
                correlationId = correlationId,
                engine = "okhttp",
            ),
        )
        return response
    }

    private fun emitError(
        id: String,
        startMs: Long,
        capturedRequest: CapturedRequest,
        correlationId: String?,
        throwable: Throwable,
    ) {
        val durationMs = Clock.System.now().toEpochMilliseconds() - startMs
        eventBus.publish(
            HttpEvent(
                id = id,
                timestamp = startMs,
                request = capturedRequest.toHttpRequest(),
                response = null,
                error = HttpError(
                    throwableClass = throwable::class.simpleName ?: throwable::class.toString(),
                    message = throwable.message,
                    stackTrace = throwable.stackTraceToString(),
                ),
                durationMs = durationMs,
                correlationId = correlationId,
                engine = "okhttp",
            ),
        )
    }
}

private fun ArgusOkHttpConfig.toCaptureConfig(): CaptureConfig = CaptureConfig(
    maxBodyBytes = maxBodyBytes,
    fullBodyHosts = fullBodyHosts,
    redactHeaders = redactHeaders,
    captureRequestBody = captureRequestBody,
    captureResponseBody = captureResponseBody,
)

private fun Headers.toRedactedHeaders(
    redact: Set<String>,
) = buildRedactedHeaders(
    pairs = (0 until size).map { i -> name(i) to value(i) },
    redactSet = redact,
)

private data class BuiltRequest(
    val captured: CapturedRequest,
    val sendable: Request,
)

private fun buildCapturedRequest(
    request: Request,
    effectiveMax: Long,
    captureRequestBody: Boolean,
    redactHeaders: Set<String>,
): BuiltRequest {
    val method = request.method
    val url = request.url
    val path = url.encodedPath.ifEmpty { "/" } +
        if (url.encodedQuery != null) "?" + url.encodedQuery else ""
    val redactedHeaders = request.headers.toRedactedHeaders(redactHeaders)

    val body = request.body
    if (body == null || !captureRequestBody) {
        val captured = CapturedRequest(
            method = method,
            url = url.toString(),
            host = url.host,
            path = path,
            headers = redactedHeaders,
            body = null,
        )
        return BuiltRequest(captured, request)
    }

    if (body.isOneShot()) {
        val captured = CapturedRequest(
            method = method,
            url = url.toString(),
            host = url.host,
            path = path,
            headers = redactedHeaders,
            body = CapturedBody(
                preview = null,
                truncatedTotalBytes = null,
                contentType = body.contentType()?.toString(),
                sizeBytes = body.contentLength().takeIf { it >= 0 },
            ),
        )
        return BuiltRequest(captured, request)
    }

    val buffer = Buffer()
    body.writeTo(buffer)
    val totalSize = buffer.size
    val capInt = effectiveMax.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    val previewBytes = buffer.peek().readByteArray(minOf(buffer.size, capInt.toLong()))

    val capturedBody = encodeCapturedBytes(
        bytes = previewBytes,
        contentType = body.contentType()?.toString(),
        totalSize = totalSize,
        maxBytes = effectiveMax,
    )

    val rebuiltBody = buffer.readByteString().toRequestBody(body.contentType())
    val rebuiltRequest = request.newBuilder().method(method, rebuiltBody).build()

    val captured = CapturedRequest(
        method = method,
        url = url.toString(),
        host = url.host,
        path = path,
        headers = redactedHeaders,
        body = capturedBody,
    )
    return BuiltRequest(captured, rebuiltRequest)
}

private fun captureResponseBody(response: Response, effectiveMax: Long): CapturedBody? {
    val body = response.body ?: return null
    val contentLength = body.contentLength()
    val readLimit = if (contentLength in 0..effectiveMax) contentLength else effectiveMax
    val peeked = response.peekBody(readLimit)
    val rawBytes = peeked.bytes()
    val capInt = effectiveMax.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    val bytes = if (rawBytes.size <= capInt) rawBytes else rawBytes.copyOf(capInt)
    val totalSize = if (contentLength >= 0) contentLength else bytes.size.toLong()
    return encodeCapturedBytes(
        bytes = bytes,
        contentType = body.contentType()?.toString(),
        totalSize = totalSize,
        maxBytes = effectiveMax,
    )
}
