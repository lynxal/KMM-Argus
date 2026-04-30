package com.lynxal.argus.correlation

import kotlin.coroutines.CoroutineContext

/**
 * Bridges the active [ArgusCorrelationId] to non-suspend callbacks (notably
 * [com.lynxal.argus.logging.ArgusLoggerDelegate.log], which is called synchronously
 * by KMMLogging on whatever thread the log site happened to run on).
 *
 * On JVM and Android the actual is backed by [java.lang.ThreadLocal]; iOS is a no-op
 * stub for now (Argus iOS support lands in Phase 4, and HTTP correlation works on iOS
 * via [currentCorrelationId] which reads `coroutineContext` directly).
 */
internal expect object CorrelationThreadLocal {
    fun get(): String?
    fun set(value: String?)
}

/**
 * Coroutine context element that mirrors the active correlation id into
 * [CorrelationThreadLocal] when the coroutine resumes on a thread, and restores the
 * previous value when it suspends. JVM/Android implements this via
 * `kotlinx.coroutines.ThreadContextElement`; iOS returns an empty context (no
 * thread-local propagation) until Phase 4 wires up `:argus-ios`.
 */
internal expect fun threadLocalCorrelationContext(value: String): CoroutineContext
