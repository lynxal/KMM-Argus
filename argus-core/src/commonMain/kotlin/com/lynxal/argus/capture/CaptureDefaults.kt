package com.lynxal.argus.capture

public object ArgusCaptureDefaults {
    public const val MAX_BODY_BYTES: Long = 1_000_000L

    public val REDACT_HEADERS: Set<String> = setOf(
        "Authorization",
        "Cookie",
        "Set-Cookie",
        "Proxy-Authorization",
    )

    public const val REDACTED_PLACEHOLDER: String = "***redacted***"
}
