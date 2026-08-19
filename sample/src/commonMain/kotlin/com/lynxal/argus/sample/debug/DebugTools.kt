package com.lynxal.argus.sample.debug

import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.StateFlow

interface DebugTools {
    fun buildHttpClient(): HttpClient
    fun installLogging()
    fun observeArgusUrl(): StateFlow<String?>

    /**
     * Message describing why the inspector isn't up, or `null` while it's fine. A String
     * rather than the Throwable so no Argus type crosses the seam. Always `null` in release.
     */
    fun observeArgusError(): StateFlow<String?>

    /** Whether the inspector is currently meant to be up. No-op flow (always false) in release. */
    fun observeArgusRunning(): StateFlow<Boolean>

    /**
     * Start the inspector. The sample does *not* start it automatically — press the button. Safe
     * to call when already running (does nothing). Watch `observeArgusUrl()` for the bound URL;
     * it stays `null` for a moment while the socket binds. No-op in release.
     */
    fun startArgus()

    /**
     * Stop the inspector and release its port. Safe to call more than once, and safe before the
     * server has finished binding. `observeArgusUrl()` goes back to `null`. Capture plugins stay
     * wired, so `startArgus()` brings the inspector back with everything reconnected — events
     * published while it's stopped are simply dropped. No-op in release.
     */
    fun stopArgus()

    /** Emit a CustomEvent through the sample's bus. No-op in release. */
    fun publishCustom(source: String, label: String, payload: String)

    /** Fire an OkHttp request through Argus's interceptor. No-op in release. */
    fun fireOkHttpCall(url: String)

    /** Fire an HttpURLConnection request wrapped by Argus. No-op in release. */
    fun fireUrlConnectionCall(url: String)

    /**
     * Fire two HTTP calls back-to-back inside one ArgusCorrelationId scope so the
     * resulting events share a correlation id. Lives behind the debug seam because
     * ArgusCorrelationId is in `:argus-core`, which release variants must not link.
     * No-op in release.
     */
    fun fireCorrelatedPair(first: String, second: String)
}
