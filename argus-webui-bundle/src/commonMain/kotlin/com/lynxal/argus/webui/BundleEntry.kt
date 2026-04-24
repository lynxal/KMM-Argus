package com.lynxal.argus.webui

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * A single static asset from the Argus SPA bundle.
 *
 * [bytes] decodes (base64 + gunzip) on first access and is cached via [lazy].
 * Equality compares both [contentType] and the decoded [bytes] — note that
 * accessing [equals] forces the decode.
 *
 * @see ArgusUiBundle
 */
class BundleEntry internal constructor(private val encoded: EncodedEntry) {
    val contentType: String get() = encoded.contentType

    @OptIn(ExperimentalEncodingApi::class)
    val bytes: ByteArray by lazy(LazyThreadSafetyMode.PUBLICATION) {
        gunzip(Base64.Default.decode(encoded.b64Gzip))
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is BundleEntry) return false
        return contentType == other.contentType && bytes.contentEquals(other.bytes)
    }

    override fun hashCode(): Int = 31 * contentType.hashCode() + bytes.contentHashCode()
}
