package com.lynxal.argus.correlation

import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext

// On iOS, log-side correlation is a no-op (no thread-local backing); HTTP-side
// correlation works via the coroutine context path (`currentCorrelationId()` in
// `ArgusClientPlugin`).
internal actual object CorrelationThreadLocal {
    actual fun get(): String? = null
    actual fun set(value: String?) {
        // no-op
    }
}

internal actual fun threadLocalCorrelationContext(value: String): CoroutineContext =
    EmptyCoroutineContext
