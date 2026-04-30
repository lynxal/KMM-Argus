package com.lynxal.argus.urlconnection

import com.lynxal.argus.model.ArgusEventBus
import java.net.HttpURLConnection

/**
 * Wraps an [HttpURLConnection] so that calls through it (request body writes, response
 * reads, error stream reads, headers, response code) emit
 * [com.lynxal.argus.model.HttpEvent] records on the supplied [ArgusEventBus].
 *
 * Typical usage:
 * ```
 * val raw = URL("https://api.example.com/users/1").openConnection() as HttpURLConnection
 * val conn = ArgusUrlConnection.wrap(raw, eventBus)
 * conn.connect()
 * conn.inputStream.use { … }
 * conn.disconnect()
 * ```
 *
 * Note: HttpURLConnection automatically follows redirects (`instanceFollowRedirects`),
 * so only the final URL is observable in the captured event.
 */
public object ArgusUrlConnection {
    public fun wrap(
        connection: HttpURLConnection,
        eventBus: ArgusEventBus,
        config: ArgusUrlConnectionConfig = ArgusUrlConnectionConfig(),
    ): HttpURLConnection = ArgusHttpURLConnection(connection, eventBus, config)
}
