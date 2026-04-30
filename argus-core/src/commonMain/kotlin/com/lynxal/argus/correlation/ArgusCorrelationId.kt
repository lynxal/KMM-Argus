@file:OptIn(ExperimentalUuidApi::class)

package com.lynxal.argus.correlation

import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.coroutineContext
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Coroutine-context element that tags every [com.lynxal.argus.model.ArgusEvent] emitted
 * underneath it with the same correlation id, so HTTP traffic and log lines from one
 * logical operation collapse into a single thread in the inspector.
 *
 * Intended use:
 * ```
 * withCorrelation {
 *     httpClient.get("/refresh")    // HttpEvent.correlationId set
 *     Logger.i("refresh-ok")        // LogEvent.correlationId set
 * }
 * ```
 *
 * Use [withCorrelation] (which combines this with the platform's thread-local bridge)
 * rather than installing the element by hand, so synchronous `Logger.x()` callbacks
 * inside the scope can still see the active id.
 *
 * The id is opaque to Argus and 16 hex chars by default — enough randomness to avoid
 * collisions within a single session, short enough to render in the EventList column.
 */
public class ArgusCorrelationId(public val value: String) : AbstractCoroutineContextElement(Key) {

    public companion object Key : CoroutineContext.Key<ArgusCorrelationId> {
        public fun new(): ArgusCorrelationId =
            ArgusCorrelationId(Uuid.random().toHexString().take(16))
    }

    override fun toString(): String = "ArgusCorrelationId($value)"
}

/** The active correlation id, or `null` if no [ArgusCorrelationId] is in scope. */
public suspend fun currentCorrelationId(): String? =
    coroutineContext[ArgusCorrelationId]?.value
