package com.lynxal.argus.model

/**
 * Convert a [Throwable] and its cause chain into a serializable [ThrowableInfo].
 *
 * Stack traces come from Kotlin stdlib's common [stackTraceToString], which is
 * available on JVM/Android/Native. Native trace fidelity depends on debug symbols;
 * on JVM it always produces `at `-prefixed frames.
 *
 * @param captureStackTraces when `false`, every node in the returned chain has
 *   `stackTrace = ""`. Useful for release-adjacent debug builds where trace text
 *   would bloat the bus but class + message are still worth capturing.
 */
internal fun Throwable.toThrowableInfo(captureStackTraces: Boolean): ThrowableInfo =
    ThrowableInfo(
        className = this::class.simpleName ?: this::class.toString(),
        message = message,
        stackTrace = if (captureStackTraces) stackTraceToString() else "",
        cause = cause?.toThrowableInfo(captureStackTraces),
    )
