package com.lynxal.argus.urlconnection

import com.lynxal.argus.capture.CaptureConfig
import com.lynxal.argus.capture.CapturedBody
import com.lynxal.argus.capture.CapturedRequest
import com.lynxal.argus.capture.buildRedactedHeaders
import com.lynxal.argus.capture.effectiveMaxBytesFor
import com.lynxal.argus.capture.encodeCapturedBytes
import com.lynxal.argus.correlation.activeCorrelationId
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.Header as ArgusHeader
import com.lynxal.argus.model.HttpError
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.HttpResponse as ArgusHttpResponse
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.Permission
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Clock
import kotlin.uuid.Uuid

internal class ArgusHttpURLConnection(
    private val delegate: HttpURLConnection,
    private val eventBus: ArgusEventBus,
    private val config: ArgusUrlConnectionConfig,
) : HttpURLConnection(delegate.url) {

    private val id: String = Uuid.random().toString()
    private val startMs: Long = Clock.System.now().toEpochMilliseconds()
    private val correlationId: String? = activeCorrelationId()
    private val emitted = AtomicBoolean(false)
    private val captureCfg: CaptureConfig get() = CaptureConfig(
        maxBodyBytes = config.maxBodyBytes,
        fullBodyHosts = config.fullBodyHosts,
        redactHeaders = config.redactHeaders,
        captureRequestBody = config.captureRequestBody,
        captureResponseBody = config.captureResponseBody,
    )
    private val effectiveMax: Long get() = effectiveMaxBytesFor(delegate.url.host, captureCfg)

    private var requestTee: TeeOutputStream? = null
    private val recordedRequestHeaders: MutableList<Pair<String, String>> = run {
        // Snapshot headers already set on the delegate before wrapping.
        val seed = mutableListOf<Pair<String, String>>()
        runCatching {
            delegate.requestProperties.forEach { (name, values) ->
                if (name == null) return@forEach
                values.forEach { v -> if (v != null) seed.add(name to v) }
            }
        }
        seed
    }

    // -- Forward most state to the delegate ----------------------------------

    override fun connect() {
        delegate.connect()
    }

    override fun disconnect() {
        emitIfNeeded()
        delegate.disconnect()
    }

    override fun usingProxy(): Boolean = delegate.usingProxy()

    override fun getResponseCode(): Int = try {
        delegate.responseCode
    } catch (t: IOException) {
        emitError(t)
        throw t
    }

    override fun getResponseMessage(): String? = delegate.responseMessage

    override fun getHeaderField(name: String?): String? = delegate.getHeaderField(name)
    override fun getHeaderField(n: Int): String? = delegate.getHeaderField(n)
    override fun getHeaderFieldKey(n: Int): String? = delegate.getHeaderFieldKey(n)
    override fun getHeaderFields(): Map<String, List<String>> = delegate.headerFields
    override fun getContentType(): String? = delegate.contentType
    override fun getContentEncoding(): String? = delegate.contentEncoding
    override fun getContentLength(): Int = delegate.contentLength
    override fun getContentLengthLong(): Long = delegate.contentLengthLong
    override fun getDate(): Long = delegate.date
    override fun getExpiration(): Long = delegate.expiration
    override fun getLastModified(): Long = delegate.lastModified
    override fun getPermission(): Permission? = delegate.permission

    override fun setRequestMethod(method: String) {
        delegate.requestMethod = method
    }
    override fun getRequestMethod(): String = delegate.requestMethod

    override fun setRequestProperty(key: String?, value: String?) {
        delegate.setRequestProperty(key, value)
        if (key != null && value != null) {
            recordedRequestHeaders.removeAll { it.first.equals(key, ignoreCase = true) }
            recordedRequestHeaders.add(key to value)
        }
    }
    override fun addRequestProperty(key: String?, value: String?) {
        delegate.addRequestProperty(key, value)
        if (key != null && value != null) {
            recordedRequestHeaders.add(key to value)
        }
    }
    override fun getRequestProperty(key: String?): String? = delegate.getRequestProperty(key)
    override fun getRequestProperties(): Map<String, List<String>> = delegate.requestProperties

    override fun setConnectTimeout(timeout: Int) { delegate.connectTimeout = timeout }
    override fun getConnectTimeout(): Int = delegate.connectTimeout
    override fun setReadTimeout(timeout: Int) { delegate.readTimeout = timeout }
    override fun getReadTimeout(): Int = delegate.readTimeout
    override fun setDoInput(doinput: Boolean) { delegate.doInput = doinput }
    override fun getDoInput(): Boolean = delegate.doInput
    override fun setDoOutput(dooutput: Boolean) { delegate.doOutput = dooutput }
    override fun getDoOutput(): Boolean = delegate.doOutput
    override fun setUseCaches(usecaches: Boolean) { delegate.useCaches = usecaches }
    override fun getUseCaches(): Boolean = delegate.useCaches
    override fun setAllowUserInteraction(allowuserinteraction: Boolean) {
        delegate.allowUserInteraction = allowuserinteraction
    }
    override fun getAllowUserInteraction(): Boolean = delegate.allowUserInteraction
    override fun setIfModifiedSince(ifmodifiedsince: Long) {
        delegate.ifModifiedSince = ifmodifiedsince
    }
    override fun getIfModifiedSince(): Long = delegate.ifModifiedSince
    override fun setInstanceFollowRedirects(followRedirects: Boolean) {
        delegate.instanceFollowRedirects = followRedirects
    }
    override fun getInstanceFollowRedirects(): Boolean = delegate.instanceFollowRedirects
    override fun setDefaultUseCaches(defaultusecaches: Boolean) {
        delegate.defaultUseCaches = defaultusecaches
    }
    override fun getDefaultUseCaches(): Boolean = delegate.defaultUseCaches
    override fun setChunkedStreamingMode(chunklen: Int) {
        delegate.setChunkedStreamingMode(chunklen)
    }
    override fun setFixedLengthStreamingMode(contentLength: Int) {
        delegate.setFixedLengthStreamingMode(contentLength)
    }
    override fun setFixedLengthStreamingMode(contentLength: Long) {
        delegate.setFixedLengthStreamingMode(contentLength)
    }

    override fun getURL(): URL = delegate.url

    // -- Body tees ----------------------------------------------------------

    override fun getOutputStream(): OutputStream {
        val raw = delegate.outputStream
        if (!config.captureRequestBody) return raw
        val tee = TeeOutputStream(raw, effectiveMax)
        requestTee = tee
        return tee
    }

    override fun getInputStream(): InputStream {
        val raw = try {
            delegate.inputStream
        } catch (t: IOException) {
            emitError(t)
            throw t
        }
        if (!config.captureResponseBody) {
            // Even without body capture, ensure we emit at the end.
            return WrapEmittingStream(raw)
        }
        return TeeInputStream(raw, effectiveMax) { bytes, total, _ ->
            emitSuccess(bodyBytes = bytes, totalRead = total)
        }
    }

    override fun getErrorStream(): InputStream? {
        val raw = delegate.errorStream ?: return null
        if (!config.captureResponseBody) return WrapEmittingStream(raw)
        return TeeInputStream(raw, effectiveMax) { bytes, total, _ ->
            emitSuccess(bodyBytes = bytes, totalRead = total)
        }
    }

    /** Wraps a stream the user opted out of capturing for, but still emits on close. */
    private inner class WrapEmittingStream(private val inner: InputStream) : InputStream() {
        override fun read(): Int = inner.read()
        override fun read(b: ByteArray, off: Int, len: Int): Int = inner.read(b, off, len)
        override fun close() {
            try { inner.close() } finally { emitIfNeeded() }
        }
    }

    // -- Emission ----------------------------------------------------------

    private fun emitIfNeeded() {
        if (emitted.get()) return
        // Try to emit a success record with whatever data we have.
        val tee = requestTee
        if (tee != null) {
            emitSuccess(bodyBytes = ByteArray(0), totalRead = 0L)
        } else {
            emitSuccess(bodyBytes = ByteArray(0), totalRead = 0L)
        }
    }

    private fun emitSuccess(bodyBytes: ByteArray, totalRead: Long) {
        if (!emitted.compareAndSet(false, true)) return
        val durationMs = Clock.System.now().toEpochMilliseconds() - startMs
        val request = buildCapturedRequest()
        val responseStatus = runCatching { delegate.responseCode }.getOrDefault(-1)
        if (responseStatus < 0) {
            // Unable to read response (e.g., connection failed). Treat as error.
            eventBus.publish(
                HttpEvent(
                    id = id,
                    timestamp = startMs,
                    request = request.toHttpRequest(),
                    response = null,
                    error = HttpError(
                        throwableClass = "IOException",
                        message = "response unavailable",
                        stackTrace = "",
                    ),
                    durationMs = durationMs,
                    correlationId = correlationId,
                    engine = "urlconnection",
                ),
            )
            return
        }
        val capturedBody = if (config.captureResponseBody && bodyBytes.isNotEmpty()) {
            val totalSize = if (totalRead >= 0) totalRead else bodyBytes.size.toLong()
            encodeCapturedBytes(
                bytes = bodyBytes,
                contentType = delegate.contentType,
                totalSize = totalSize,
                maxBytes = effectiveMax,
            )
        } else {
            null
        }
        val responseHeaders = buildResponseHeaders()
        val argusResponse = ArgusHttpResponse(
            statusCode = responseStatus,
            statusText = delegate.responseMessage ?: "",
            headers = responseHeaders,
            bodyPreview = capturedBody?.preview,
            bodyTruncatedTotalBytes = capturedBody?.truncatedTotalBytes,
            contentType = capturedBody?.contentType ?: delegate.contentType,
            sizeBytes = capturedBody?.sizeBytes ?: delegate.contentLengthLong.takeIf { it >= 0 },
        )
        eventBus.publish(
            HttpEvent(
                id = id,
                timestamp = startMs,
                request = request.toHttpRequest(),
                response = argusResponse,
                error = null,
                durationMs = durationMs,
                correlationId = correlationId,
                engine = "urlconnection",
            ),
        )
    }

    private fun emitError(throwable: Throwable) {
        if (!emitted.compareAndSet(false, true)) return
        val durationMs = Clock.System.now().toEpochMilliseconds() - startMs
        val request = buildCapturedRequest()
        eventBus.publish(
            HttpEvent(
                id = id,
                timestamp = startMs,
                request = request.toHttpRequest(),
                response = null,
                error = HttpError(
                    throwableClass = throwable::class.simpleName ?: throwable::class.toString(),
                    message = throwable.message,
                    stackTrace = throwable.stackTraceToString(),
                ),
                durationMs = durationMs,
                correlationId = correlationId,
                engine = "urlconnection",
            ),
        )
    }

    private fun buildCapturedRequest(): CapturedRequest {
        val method = runCatching { delegate.requestMethod }.getOrDefault("GET")
        val u = delegate.url
        val headers = buildRequestHeaders()
        val body: CapturedBody? = requestTee?.let { tee ->
            val raw = tee.capturedBytes
            encodeCapturedBytes(
                bytes = raw,
                contentType = delegate.getRequestProperty("Content-Type"),
                totalSize = tee.totalBytesWritten,
                maxBytes = effectiveMax,
            )
        }
        return CapturedRequest(
            method = method,
            url = u.toString(),
            host = u.host,
            path = (u.path.ifEmpty { "/" }) + (u.query?.let { "?$it" } ?: ""),
            headers = headers,
            body = body,
        )
    }

    private fun buildRequestHeaders(): List<ArgusHeader> {
        // Use headers we recorded at construction + via setRequestProperty/addRequestProperty.
        // JDK may strip the live requestProperties view once the connection is committed.
        return buildRedactedHeaders(recordedRequestHeaders.toList(), config.redactHeaders)
    }

    private fun buildResponseHeaders(): List<ArgusHeader> {
        val pairs = mutableListOf<Pair<String, String>>()
        runCatching {
            delegate.headerFields.forEach { (name, values) ->
                if (name == null) return@forEach
                values.forEach { v -> if (v != null) pairs.add(name to v) }
            }
        }
        return buildRedactedHeaders(pairs, config.redactHeaders)
    }
}
