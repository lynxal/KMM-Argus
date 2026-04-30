@file:OptIn(InternalArgusApi::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.capture.InternalArgusApi
import com.lynxal.argus.capture.buildRedactedHeaders
import com.lynxal.argus.model.Header
import io.ktor.http.Headers

internal fun Headers.toArgusHeaders(redactSet: Set<String>): List<Header> {
    val pairs = buildList {
        entries().forEach { (name, values) ->
            values.forEach { value -> add(name to value) }
        }
    }
    return buildRedactedHeaders(pairs, redactSet)
}
