package com.lynxal.argus.capture

import com.lynxal.argus.model.Header

@InternalArgusApi
public fun buildRedactedHeaders(
    pairs: Iterable<Pair<String, String>>,
    redactSet: Set<String>,
): List<Header> {
    val lowered = redactSet.mapTo(HashSet(redactSet.size)) { it.lowercase() }
    return pairs.map { (name, value) ->
        val redact = lowered.contains(name.lowercase())
        Header(
            name = name,
            value = if (redact) ArgusCaptureDefaults.REDACTED_PLACEHOLDER else value,
            redacted = redact,
        )
    }
}
