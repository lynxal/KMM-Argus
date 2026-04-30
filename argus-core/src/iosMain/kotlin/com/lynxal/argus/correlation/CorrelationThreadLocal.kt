package com.lynxal.argus.correlation

import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext

// iOS support for Argus arrives in Phase 4 (`:argus-ios`). Until then, log-side
// correlation on iOS is a no-op; HTTP-side correlation still works via the coroutine
// context path (`currentCorrelationId()` in `ArgusClientPlugin`).
internal actual object CorrelationThreadLocal {
    actual fun get(): String? = null
    actual fun set(value: String?) {
        // no-op
    }
}

internal actual fun threadLocalCorrelationContext(value: String): CoroutineContext =
    EmptyCoroutineContext
