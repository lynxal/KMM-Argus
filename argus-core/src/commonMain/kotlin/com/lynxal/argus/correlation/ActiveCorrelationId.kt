package com.lynxal.argus.correlation

/**
 * Returns the currently active correlation id as seen from the calling thread.
 *
 * Coroutine-aware code should prefer [currentCorrelationId] (a `suspend fun` that reads
 * the coroutine context directly). Synchronous transports — OkHttp interceptors,
 * `HttpURLConnection` wrappers, and KMMLogging delegates — have no coroutine context
 * to read from on the call site, so they call this function instead.
 *
 * Backed by [CorrelationThreadLocal], which the [withCorrelation] helper populates on
 * JVM and Android. On iOS, the thread-local backing returns `null` (no synchronous
 * propagation); coroutine-aware callers should use [currentCorrelationId] instead.
 */
public fun activeCorrelationId(): String? = CorrelationThreadLocal.get()
