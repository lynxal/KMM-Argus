package com.lynxal.argus.model

import kotlinx.serialization.Serializable

/**
 * Wire-compatibility version for the Argus event schema.
 *
 * Bump only when the shape of [ArgusEvent] or [HelloPayload] changes in a way that
 * older clients cannot decode. This is independent of the library's semver —
 * consumers pin on semver but negotiate wire compatibility on this constant.
 */
public const val ARGUS_SCHEMA_VERSION: Int = 2

/**
 * First message the server sends over the WebSocket stream on connect.
 *
 * Carries [schemaVersion] so a client can reject streams it can't decode,
 * plus an optional human-readable server identity.
 */
@Serializable
public data class HelloPayload(
    val schemaVersion: Int = ARGUS_SCHEMA_VERSION,
    val serverName: String = "argus",
    val serverVersion: String? = null,
    val appInfo: AppInfo? = null,
)
