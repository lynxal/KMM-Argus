package com.lynxal.argus.model

import kotlinx.serialization.Serializable

/**
 * Host-app identity advertised by the Argus server.
 *
 * Surfaced in the `/api/info` REST response and embedded in the WebSocket
 * `hello` handshake so that a browser client can label which device it is
 * connected to.
 */
@Serializable
public data class AppInfo(
    val pkg: String,
    val versionName: String,
    val device: String,
    val argusVersion: String,
)
