package com.lynxal.argus.model

import kotlinx.serialization.json.Json

/**
 * Single source of truth for serializing [ArgusEvent]s — used by both the WebSocket
 * route in `:argus-server-core` and the on-disk payload column in `:argus-core`'s
 * persistence layer. Keeps `classDiscriminator = "type"` so polymorphic events
 * round-trip with the shape the UI already expects. `ignoreUnknownKeys` and
 * `explicitNulls = false` give legacy/forward-compat payloads a clean read path.
 */
public val ArgusJson: Json = Json {
    classDiscriminator = "type"
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}
