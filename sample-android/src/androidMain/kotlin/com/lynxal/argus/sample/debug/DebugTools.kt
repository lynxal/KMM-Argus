package com.lynxal.argus.sample.debug

import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.StateFlow

interface DebugTools {
    fun buildHttpClient(): HttpClient
    fun installLogging()
    fun observeArgusUrl(): StateFlow<String?>

    /** Phase 3: emit a CustomEvent through the sample's bus. No-op in release. */
    fun publishCustom(source: String, label: String, payload: String)

    /** Phase 3: fire an OkHttp request through Argus's interceptor. No-op in release. */
    fun fireOkHttpCall(url: String)

    /** Phase 3: fire an HttpURLConnection request wrapped by Argus. No-op in release. */
    fun fireUrlConnectionCall(url: String)

    /**
     * Fire two HTTP calls back-to-back inside one ArgusCorrelationId scope so the
     * resulting events share a correlation id. Lives behind the debug seam because
     * ArgusCorrelationId is in `:argus-core`, which release variants must not link.
     * No-op in release.
     */
    fun fireCorrelatedPair(first: String, second: String)
}
