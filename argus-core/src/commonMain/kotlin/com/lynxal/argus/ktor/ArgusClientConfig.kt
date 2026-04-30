package com.lynxal.argus.ktor

import com.lynxal.argus.capture.ArgusCaptureDefaults
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.NoopEventBus

public class ArgusClientConfig {
    public var eventBus: ArgusEventBus = NoopEventBus
    public var maxBodyBytes: Long = DEFAULT_MAX_BODY_BYTES
    public var redactHeaders: Set<String> = DEFAULT_REDACT_HEADERS
    public var captureRequestBody: Boolean = true
    public var captureResponseBody: Boolean = true

    /**
     * Hosts whose request and response bodies bypass [maxBodyBytes] and are captured
     * in full. Match is case-insensitive on the request URL host (no port, no scheme).
     *
     * Use sparingly — a misbehaving endpoint with a multi-GB body will be held in
     * memory for the lifetime of the capture. Argus enforces no safety ceiling here.
     */
    public var fullBodyHosts: Set<String> = emptySet()

    public companion object {
        public const val DEFAULT_MAX_BODY_BYTES: Long = ArgusCaptureDefaults.MAX_BODY_BYTES

        public val DEFAULT_REDACT_HEADERS: Set<String> = ArgusCaptureDefaults.REDACT_HEADERS

        public const val REDACTED_PLACEHOLDER: String = ArgusCaptureDefaults.REDACTED_PLACEHOLDER
    }
}
