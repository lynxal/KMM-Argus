package com.lynxal.argus.okhttp

import com.lynxal.argus.capture.ArgusCaptureDefaults

public class ArgusOkHttpConfig {
    public var maxBodyBytes: Long = ArgusCaptureDefaults.MAX_BODY_BYTES
    public var redactHeaders: Set<String> = ArgusCaptureDefaults.REDACT_HEADERS
    public var captureRequestBody: Boolean = true
    public var captureResponseBody: Boolean = true

    /**
     * Hosts whose request and response bodies bypass [maxBodyBytes] and are captured
     * in full. Match is case-insensitive on the request URL host (no port, no scheme).
     */
    public var fullBodyHosts: Set<String> = emptySet()
}
