package com.lynxal.argus.correlation

import kotlin.coroutines.CoroutineContext

/**
 * Bridges the active [ArgusCorrelationId] to non-suspend callbacks (notably
 * [com.lynxal.argus.logging.ArgusLoggerDelegate.log], which is called synchronously
 * by KMMLogging on whatever thread the log site happened to run on).
 *
 * Backed by [java.lang.ThreadLocal] on JVM/Android and by `@kotlin.native.concurrent.ThreadLocal`
 * on iOS, so synchronous log callbacks see the active id on every supported platform.
 */
internal expect object CorrelationThreadLocal {
    fun get(): String?
    fun set(value: String?)
}

/**
 * Coroutine context element that mirrors the active correlation id into
 * [CorrelationThreadLocal] when the coroutine resumes on a thread, and restores the
 * previous value when it suspends. JVM/Android implements this via
 * `kotlinx.coroutines.ThreadContextElement`; iOS returns an empty context (no public
 * `ThreadContextElement` on K/N) and relies on [withCorrelationStorage] to bracket
 * the block instead.
 */
internal expect fun threadLocalCorrelationContext(value: String): CoroutineContext

/**
 * Wraps [block] so [CorrelationThreadLocal] reflects [value] inside it. JVM/Android is a
 * passthrough — the [threadLocalCorrelationContext] coroutine element already mirrors
 * the id on every dispatch. iOS sets the thread-local on entry and restores the previous
 * value on exit, so the synchronous `ArgusLoggerDelegate.log` callback can still see the
 * id when invoked from inside `withCorrelation`.
 */
internal expect suspend fun <T> withCorrelationStorage(
    value: String,
    block: suspend () -> T,
): T
