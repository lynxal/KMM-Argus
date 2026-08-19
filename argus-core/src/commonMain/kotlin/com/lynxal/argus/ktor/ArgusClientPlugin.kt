@file:OptIn(
    ExperimentalUuidApi::class, ExperimentalTime::class, InternalAPI::class, InternalArgusApi::class
)

package com.lynxal.argus.ktor

import com.lynxal.argus.capture.CaptureConfig
import com.lynxal.argus.capture.CapturedBody
import com.lynxal.argus.capture.CapturedRequest
import com.lynxal.argus.capture.InternalArgusApi
import com.lynxal.argus.capture.effectiveMaxBytesFor
import com.lynxal.argus.capture.encodeCapturedBytes
import com.lynxal.argus.correlation.ArgusCorrelationId
import com.lynxal.argus.util.bestEffortFqn
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.Header
import com.lynxal.argus.model.HttpError
import com.lynxal.argus.model.HttpEvent
import com.lynxal.argus.model.HttpResponse as ArgusHttpResponse
import io.ktor.client.call.HttpClientCall
import io.ktor.client.call.replaceResponse
import io.ktor.client.plugins.api.ClientPlugin
import io.ktor.client.plugins.api.Send
import io.ktor.client.plugins.api.createClientPlugin
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.statement.HttpReceivePipeline
import io.ktor.client.statement.HttpResponse as KtorHttpResponse
import io.ktor.http.HttpHeaders
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.InternalAPI
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Ktor client plugin that captures every request/response pair into the configured
 * [ArgusEventBus]. Install on your `HttpClient`:
 *
 * ```
 * val client = HttpClient(CIO) {
 *     install(Argus) {
 *         eventBus = argusHandle.eventBus
 *     }
 * }
 * ```
 *
 * Header redaction, body cap, per-host full-body bypass, and request/response capture
 * toggles are configured via [ArgusClientConfig]. Response capture reads the prefix
 * (up to [ArgusClientConfig.maxBodyBytes]) into memory and replays it to the host via
 * a fresh [ByteReadChannel] per `rawContent` access; bodies that exceed the prefix
 * cap stream the tail through a writer so the host can still read past the cap.
 */
public val Argus: ClientPlugin<ArgusClientConfig> =
    createClientPlugin("Argus", ::ArgusClientConfig) {
        val cfg = pluginConfig
        val bus: ArgusEventBus = cfg.eventBus

        onRequest { request, content ->
            val id = Uuid.random().toString()
            val startMs = Clock.System.now().toEpochMilliseconds()
            request.attributes.put(ArgusIdKey, id)
            request.attributes.put(ArgusStartMsKey, startMs)
            coroutineContext[ArgusCorrelationId]?.value?.let {
                    request.attributes.put(
                        ArgusCorrelationKey,
                        it
                    )
                }

            val method = request.method.value
            val url = request.url.buildString()
            val host = request.url.host
            val path = request.url.build().encodedPath.ifEmpty { "/" }
            val headers = request.headers.build().toArgusHeaders(cfg.redactHeaders)

            val effectiveMaxBytes = effectiveMaxBytesFor(host, cfg.toCaptureConfig())
            request.attributes.put(ArgusMaxBodyBytesKey, effectiveMaxBytes)

            val reqBody: CapturedBody? = if (cfg.captureRequestBody) {
                val ctHeader = request.headers[HttpHeaders.ContentType]?.let {
                    runCatching {
                        io.ktor.http.ContentType.parse(it)
                    }.getOrNull()
                }
                runCatching {
                    captureRequestPayload(content, ctHeader, effectiveMaxBytes)
                }.getOrNull()
            } else null

            request.attributes.put(
                ArgusRequestSnapshotKey,
                CapturedRequest(
                    method = method,
                    url = url,
                    host = host,
                    path = path,
                    headers = headers,
                    body = reqBody,
                ),
            )
        }

        if (cfg.captureResponseBody) {
            client.receivePipeline.intercept(HttpReceivePipeline.After) {
                val response = subject
                if (response.call.attributes.getOrNull(ArgusIdKey) == null) {
                    return@intercept
                }

                val maxBytes =
                    response.call.attributes.getOrNull(ArgusMaxBodyBytesKey) ?: cfg.maxBodyBytes

                // Capture the source channel reference exactly once. Some HttpResponse
                // implementations expose `rawContent` as a `get()` accessor that returns
                // a fresh view of the buffered body each access — re-evaluating it
                // between the prefix read and the tail stream would double-count bytes.
                val source: ByteReadChannel = response.rawContent

                // readPrefix never throws — see its KDoc. On mid-read failure it
                // returns whatever bytes it accumulated plus the throwable. We
                // hand those bytes back to the host via the replay path so the
                // host sees a deterministic truncated body instead of the original
                // channel that's been partially drained by us.
                val captured = source.readPrefix(maxBytes)
                if (captured.readError != null) {
                    runCatching { emitError(bus, cfg, response.call, captured.readError) }
                    val bytes = captured.bytes
                    val wrappedCall = response.call.replaceResponse { ByteReadChannel(bytes) }
                    proceedWith(wrappedCall.response)
                    return@intercept
                }

                if (captured.sourceExhausted) {
                    // Whole body now in memory. Build a fresh ByteReadChannel on EACH
                    // access to rawContent — Ktor's `DelegatedResponse.rawContent` is
                    // `get() = origin.content()`, which invokes this lambda every time
                    // rawContent is read. Returning the same instance would let the
                    // first downstream consumer (Logging observer, BodyProgress,
                    // ContentNegotiation, …) exhaust/cancel it, causing subsequent
                    // reads — including the app's body<T>() — to throw
                    // "Channel was cancelled". The KDoc on `replaceResponse` is
                    // explicit about this contract.
                    val bytes = captured.bytes
                    val wrappedCall = response.call.replaceResponse { ByteReadChannel(bytes) }
                    val wrappedResponse = wrappedCall.response

                    val body = encodeCapturedBytes(
                        bytes = captured.bytes,
                        contentType = wrappedResponse.contentTypeOrNull()?.toString(),
                        totalSize = captured.bytes.size.toLong(),
                        maxBytes = maxBytes,
                    )
                    runCatching { emitSuccess(bus, cfg, wrappedCall, wrappedResponse, body) }
                    proceedWith(wrappedResponse)
                    return@intercept
                }

                // Body exceeds the prefix cap. Build a writer that emits prefix then
                // streams the original tail through to a fresh channel for the app.
                // The writer owns the channel the app reads from — no shared upstream
                // pump, no second observer of the original channel.
                //
                // Caveat: `replaceResponse`'s content lambda is invoked on every
                // rawContent access (see DelegatedResponse). The writer's channel is
                // single-consumption, so streamed responses can only be read once
                // through this wrapped response — additional readers will see an
                // empty/closed channel. This is an accepted limitation for bodies
                // exceeding maxBodyBytes; small bodies use the in-memory path above
                // which IS replayable.
                val streamed = streamPrefixedTail(response, source, captured.bytes)
                val streamedChannel = streamed.channel
                val wrappedCall = response.call.replaceResponse { streamedChannel }
                val wrappedResponse = wrappedCall.response

                // Emit only after the writer completes so `bodyTruncatedTotalBytes`
                // reflects the actual source size.
                response.launch {
                    val total = streamed.awaitTotal()
                    val body = encodeCapturedBytes(
                        bytes = captured.bytes,
                        contentType = wrappedResponse.contentTypeOrNull()?.toString(),
                        totalSize = total,
                        maxBytes = maxBytes,
                    )
                    runCatching { emitSuccess(bus, cfg, wrappedCall, wrappedResponse, body) }
                }

                proceedWith(wrappedResponse)
            }
        } else {
            onResponse { response ->
                if (response.call.attributes.getOrNull(ArgusIdKey) == null) return@onResponse
                emitSuccess(bus, cfg, response.call, response, null)
            }
        }

        on(Send) { request: HttpRequestBuilder ->
            try {
                proceed(request)
            } catch (t: Throwable) {
                runCatching { emitNetworkError(bus, request, t) }
                throw t
            }
        }
    }

private fun KtorHttpResponse.contentTypeOrNull(): io.ktor.http.ContentType? {
    val header = headers[HttpHeaders.ContentType] ?: return null
    return runCatching { io.ktor.http.ContentType.parse(header) }.getOrNull()
}

internal fun ArgusClientConfig.toCaptureConfig(): CaptureConfig = CaptureConfig(
    maxBodyBytes = maxBodyBytes,
    fullBodyHosts = fullBodyHosts,
    redactHeaders = redactHeaders,
    captureRequestBody = captureRequestBody,
    captureResponseBody = captureResponseBody,
)

/**
 * Builds the request side of an event for the hop that actually ran.
 *
 * A redirect is re-sent through the `Send` pipeline, not the request pipeline, so
 * `onRequest` runs once per logical request while the receive interceptor runs once
 * per hop. Reading the url and headers off the snapshot would report the first hop's
 * target on every hop's event, so they come from `call.request` instead. The body can
 * only come from the snapshot — it was captured before the content was consumed — and
 * is carried over only while the method still matches, since a 303 rewrites the hop to
 * a GET and drops the body.
 */
private fun perHopRequest(
    cfg: ArgusClientConfig,
    call: HttpClientCall,
    snapshot: CapturedRequest,
): CapturedRequest {
    val request = call.request
    val method = request.method.value
    return CapturedRequest(
        method = method,
        url = request.url.toString(),
        host = request.url.host,
        path = request.url.encodedPath.ifEmpty { "/" },
        headers = request.headers.toArgusHeaders(cfg.redactHeaders),
        body = if (method == snapshot.method) snapshot.body else null,
    )
}

/**
 * Per-hop timing. `requestTime`/`responseTime` are set by the engine for the hop that
 * produced this response, so they don't smear a redirect chain's hops together the way
 * the request-scoped start timestamp does. Falls back to the start timestamp when an
 * engine leaves them unset or inverted.
 */
private fun hopTiming(response: KtorHttpResponse, startMs: Long): Pair<Long, Long> {
    val begin = response.requestTime.timestamp
    val end = response.responseTime.timestamp
    return if (begin > 0 && end >= begin) {
        begin to (end - begin)
    } else {
        startMs to (Clock.System.now().toEpochMilliseconds() - startMs)
    }
}

private fun emitSuccess(
    bus: ArgusEventBus,
    cfg: ArgusClientConfig,
    call: HttpClientCall,
    response: KtorHttpResponse,
    body: CapturedBody?,
) {
    val attrs = call.attributes
    if (attrs.getOrNull(ArgusEmittedKey) == true) return
    attrs.put(ArgusEmittedKey, true)

    // The id is minted per emitted event, not per request: every hop of a redirect
    // inherits the request attributes, so an id stored there would be shared by all of
    // them and consumers keyed by id (the webui's list rows) would collide.
    //
    // That inheritance is what makes ArgusIdKey a per-logical-request handle, so it is
    // published as `requestGroupId` — the thing that ties a redirect chain's hops back
    // together now that each one is its own event.
    val groupId = attrs.getOrNull(ArgusIdKey) ?: return
    val id = Uuid.random().toString()
    val snapshot = attrs.getOrNull(ArgusRequestSnapshotKey) ?: return
    val startMs = attrs.getOrNull(ArgusStartMsKey) ?: return
    val (timestamp, durationMs) = hopTiming(response, startMs)

    val respHeaders: List<Header> = response.headers.toArgusHeaders(cfg.redactHeaders)
    val argusResponse = ArgusHttpResponse(
        statusCode = response.status.value,
        statusText = response.status.description,
        headers = respHeaders,
        bodyPreview = body?.preview,
        bodyTruncatedTotalBytes = body?.truncatedTotalBytes,
        contentType = body?.contentType,
        sizeBytes = body?.sizeBytes,
    )

    bus.publish(
        HttpEvent(
            id = id,
            timestamp = timestamp,
            request = perHopRequest(cfg, call, snapshot).toHttpRequest(),
            response = argusResponse,
            error = null,
            durationMs = durationMs,
            correlationId = attrs.getOrNull(ArgusCorrelationKey),
            engine = "ktor",
            requestGroupId = groupId,
        ),
    )
}

private fun emitError(
    bus: ArgusEventBus,
    cfg: ArgusClientConfig,
    call: HttpClientCall,
    throwable: Throwable,
) {
    val attrs = call.attributes
    if (attrs.getOrNull(ArgusEmittedKey) == true) return
    attrs.put(ArgusEmittedKey, true)

    val groupId = attrs.getOrNull(ArgusIdKey) ?: return
    val id = Uuid.random().toString()
    val snapshot = attrs.getOrNull(ArgusRequestSnapshotKey) ?: return
    val startMs = attrs.getOrNull(ArgusStartMsKey) ?: return
    val durationMs = Clock.System.now().toEpochMilliseconds() - startMs

    bus.publish(
        HttpEvent(
            id = id,
            timestamp = startMs,
            request = perHopRequest(cfg, call, snapshot).toHttpRequest(),
            response = null,
            error = throwable.toHttpError(),
            durationMs = durationMs,
            correlationId = attrs.getOrNull(ArgusCorrelationKey),
            engine = "ktor",
            requestGroupId = groupId,
        ),
    )
}

private fun emitNetworkError(
    bus: ArgusEventBus,
    request: HttpRequestBuilder,
    throwable: Throwable,
) {
    val attrs = request.attributes
    if (attrs.getOrNull(ArgusEmittedKey) == true) return
    attrs.put(ArgusEmittedKey, true)

    val groupId = attrs.getOrNull(ArgusIdKey) ?: return
    val id = Uuid.random().toString()
    val snapshot = attrs.getOrNull(ArgusRequestSnapshotKey) ?: return
    val startMs = attrs.getOrNull(ArgusStartMsKey) ?: return
    val durationMs = Clock.System.now().toEpochMilliseconds() - startMs

    bus.publish(
        HttpEvent(
            id = id,
            timestamp = startMs,
            request = snapshot.toHttpRequest(),
            response = null,
            error = throwable.toHttpError(),
            durationMs = durationMs,
            correlationId = attrs.getOrNull(ArgusCorrelationKey),
            engine = "ktor",
            requestGroupId = groupId,
        ),
    )
}

private fun Throwable.toHttpError(): HttpError = HttpError(
    throwableClass = this::class.bestEffortFqn(),
    message = message,
    stackTrace = stackTraceToString(),
)
