package com.lynxal.argus.ktor

import com.lynxal.argus.capture.ArgusCaptureDefaults
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.NoopEventBus

/**
 * Configuration for the Ktor [com.lynxal.argus.ktor.Argus] client plugin. Default values
 * make the plugin a no-op (events are published to [NoopEventBus]); set [eventBus] to
 * a live [com.lynxal.argus.android.ArgusHandle.eventBus] / [com.lynxal.argus.ios.ArgusHandle.eventBus]
 * to wire capture into the embedded inspector.
 */
public class ArgusClientConfig {
    /**
     * Event sink for captured requests/responses. Defaults to [NoopEventBus] — set this
     * to your [com.lynxal.argus.android.ArgusHandle.eventBus] (or iOS equivalent) so
     * captures land in the inspector's ring buffer.
     */
    public var eventBus: ArgusEventBus = NoopEventBus

    /**
     * Per-body capture cap in bytes. Bodies larger than this are truncated and the
     * captured event reports `bodyTruncatedTotalBytes`. Default 1 MB.
     */
    public var maxBodyBytes: Long = DEFAULT_MAX_BODY_BYTES

    /**
     * Set of HTTP header names whose values are replaced with `***redacted***` before
     * capture. Match is case-insensitive. Defaults to `Authorization`, `Cookie`,
     * `Set-Cookie`, `Proxy-Authorization`.
     */
    public var redactHeaders: Set<String> = DEFAULT_REDACT_HEADERS

    /**
     * When `true` (default), request bodies are captured up to [maxBodyBytes]. Set to
     * `false` to skip request-body capture entirely (only metadata is recorded).
     */
    public var captureRequestBody: Boolean = true

    /**
     * When `true` (default), response bodies are captured up to [maxBodyBytes]. Set to
     * `false` to skip response-body capture entirely (only metadata is recorded).
     */
    public var captureResponseBody: Boolean = true

    /**
     * Hosts whose request and response bodies bypass [maxBodyBytes] and are captured
     * in full. Match is case-insensitive on the request URL host (no port, no scheme).
     *
     * Effective ceiling per body is ~2 GB (`Int.MAX_VALUE` bytes) because captured
     * payloads are held in a single `ByteArray`. Larger payloads are truncated and
     * the captured event reports `truncatedTotalBytes` accordingly. Use sparingly —
     * a misbehaving endpoint can pin sizable buffers in memory for the lifetime of
     * the capture.
     */
    public var fullBodyHosts: Set<String> = emptySet()

    public companion object {
        public const val DEFAULT_MAX_BODY_BYTES: Long = ArgusCaptureDefaults.MAX_BODY_BYTES

        public val DEFAULT_REDACT_HEADERS: Set<String> = ArgusCaptureDefaults.REDACT_HEADERS

        public const val REDACTED_PLACEHOLDER: String = ArgusCaptureDefaults.REDACTED_PLACEHOLDER
    }
}
