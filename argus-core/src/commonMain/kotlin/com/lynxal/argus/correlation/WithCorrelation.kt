package com.lynxal.argus.correlation

import kotlinx.coroutines.withContext

/**
 * Run [block] under a fresh [ArgusCorrelationId], stamping every Argus event emitted
 * inside with the same id.
 */
public suspend fun <T> withCorrelation(block: suspend () -> T): T {
    val id = ArgusCorrelationId.new()
    return withContext(id + threadLocalCorrelationContext(id.value)) { block() }
}

/**
 * Run [block] under the supplied correlation id. Use when a caller already owns an id —
 * for example, propagated from an inbound webhook header — and wants to thread it
 * through the rest of the operation.
 */
public suspend fun <T> withCorrelation(
    id: String,
    block: suspend () -> T,
): T = withContext(ArgusCorrelationId(id) + threadLocalCorrelationContext(id)) { block() }
