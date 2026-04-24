package com.lynxal.argus.server.routes

import kotlinx.serialization.json.Json

/**
 * Shared [Json] instance for Argus server routes and WebSocket frames.
 *
 * Keeps `classDiscriminator = "type"` — matches `:argus-core`'s [com.lynxal.argus.model.ArgusEvent]
 * polymorphism so nested events serialize with the same shape the UI already expects.
 * `ignoreUnknownKeys` + `explicitNulls = false` make legacy/forward-compat payloads decode cleanly.
 */
internal val ArgusJson: Json = Json {
    classDiscriminator = "type"
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}
