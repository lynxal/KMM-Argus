package com.lynxal.argus.correlation

import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.native.concurrent.ThreadLocal

@ThreadLocal
private var currentValue: String? = null

internal actual object CorrelationThreadLocal {
    actual fun get(): String? = currentValue
    actual fun set(value: String?) {
        currentValue = value
    }
}

// Kotlin/Native (1.10.2) does not ship a public `ThreadContextElement` on iOS, so we
// can't attach a coroutine element that auto-mirrors the id on every dispatch. Instead,
// `withCorrelationStorage` (the iOS actual) manually sets/restores [CorrelationThreadLocal]
// around the block. The element returned here is empty so the JVM-shaped wiring in
// [withCorrelation] still compiles uniformly across targets.
internal actual fun threadLocalCorrelationContext(value: String): CoroutineContext =
    EmptyCoroutineContext

internal actual suspend fun <T> withCorrelationStorage(
    value: String,
    block: suspend () -> T,
): T {
    val previous = CorrelationThreadLocal.get()
    CorrelationThreadLocal.set(value)
    try {
        return block()
    } finally {
        CorrelationThreadLocal.set(previous)
    }
}
