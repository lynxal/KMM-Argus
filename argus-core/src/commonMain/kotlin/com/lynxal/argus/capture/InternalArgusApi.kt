package com.lynxal.argus.capture

@RequiresOptIn(
    level = RequiresOptIn.Level.ERROR,
    message = "Internal Argus engine SPI. Stable for Argus' own engine modules " +
        "(:argus-okhttp, :argus-urlconnection, the Ktor plugin) but not for external consumers. " +
        "Do not annotate your own code with this.",
)
@Retention(AnnotationRetention.BINARY)
@Target(
    AnnotationTarget.CLASS,
    AnnotationTarget.FUNCTION,
    AnnotationTarget.PROPERTY,
    AnnotationTarget.TYPEALIAS,
)
public annotation class InternalArgusApi
