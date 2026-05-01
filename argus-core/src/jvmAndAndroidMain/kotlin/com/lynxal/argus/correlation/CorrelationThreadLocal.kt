package com.lynxal.argus.correlation

import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.ThreadContextElement

internal actual object CorrelationThreadLocal {
    private val tl = ThreadLocal<String?>()
    actual fun get(): String? = tl.get()
    actual fun set(value: String?) {
        if (value == null) tl.remove() else tl.set(value)
    }
}

private object CorrelationContextKey : CoroutineContext.Key<CorrelationContextElement>

private class CorrelationContextElement(
    private val value: String,
) : AbstractCoroutineContextElement(CorrelationContextKey), ThreadContextElement<String?> {

    override fun updateThreadContext(context: CoroutineContext): String? {
        val previous = CorrelationThreadLocal.get()
        CorrelationThreadLocal.set(value)
        return previous
    }

    override fun restoreThreadContext(context: CoroutineContext, oldState: String?) {
        CorrelationThreadLocal.set(oldState)
    }
}

internal actual fun threadLocalCorrelationContext(value: String): CoroutineContext =
    CorrelationContextElement(value)

internal actual suspend fun <T> withCorrelationStorage(
    value: String,
    block: suspend () -> T,
): T = block()
