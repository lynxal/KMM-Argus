package com.lynxal.argus.ktor

import com.lynxal.argus.model.Header
import io.ktor.http.Headers

internal fun Headers.toArgusHeaders(redactSet: Set<String>): List<Header> {
    val lowered = redactSet.mapTo(HashSet(redactSet.size)) { it.lowercase() }
    return buildList {
        entries().forEach { (name, values) ->
            val redact = lowered.contains(name.lowercase())
            values.forEach { value ->
                add(
                    Header(
                        name = name,
                        value = if (redact) ArgusClientConfig.REDACTED_PLACEHOLDER else value,
                        redacted = redact,
                    ),
                )
            }
        }
    }
}
