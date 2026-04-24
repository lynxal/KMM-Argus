package com.lynxal.argus.webui

/**
 * In-process copy of the Argus SPA, served by the embedded Ktor server.
 *
 * Keys use a leading slash (e.g. `/index.html`, `/assets/index-abc123.js`) so
 * request paths from Ktor can be looked up directly. Asset bytes are decoded
 * lazily per-entry on first access.
 *
 * @see get for the SPA fallback behavior.
 */
object ArgusUiBundle {
    val files: Map<String, BundleEntry> =
        EncodedBundle.entries.mapValues { (_, enc) -> BundleEntry(enc) }

    /**
     * Resolve [path] to a bundle entry.
     *
     * Returns the exact match if present; otherwise falls back to `/index.html`
     * for SPA routes — trailing-slash paths and extensionless paths. Paths that
     * look like asset requests (have an extension, e.g. `/missing.png`) return
     * null so the server can respond 404 rather than masquerading index.html.
     */
    fun get(path: String): BundleEntry? =
        files[path] ?: if (path.endsWith("/") || !path.contains('.')) files["/index.html"] else null
}
