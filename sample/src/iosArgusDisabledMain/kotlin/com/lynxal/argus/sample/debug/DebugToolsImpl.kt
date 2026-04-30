// Invariant: this file must not import anything from com.lynxal.argus.*
// Enforced by :sample:verifyIosReleaseHasNoArgus (xcodebuild -configuration Release
// then nm/strings on the produced framework binary — fails if any com.lynxal.argus.,
// kfun:com.lynxal.argus., io.ktor.server., ArgusServer, or ArgusEventBus symbol is
// present).
package com.lynxal.argus.sample.debug

import com.lynxal.logging.DebugLoggerImplementation
import com.lynxal.logging.Logger
import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DebugToolsImpl : DebugTools {
    private val empty: StateFlow<String?> = MutableStateFlow<String?>(null).asStateFlow()

    override fun buildHttpClient(): HttpClient = HttpClient(Darwin) {
        install(ContentNegotiation) {
            json()
        }
    }

    override fun installLogging() {
        Logger.add(DebugLoggerImplementation())
    }

    override fun observeArgusUrl(): StateFlow<String?> = empty

    override fun publishCustom(source: String, label: String, payload: String) {
        // no-op in release
    }

    override fun fireOkHttpCall(url: String) {
        // no-op in release
    }

    override fun fireUrlConnectionCall(url: String) {
        // no-op in release
    }

    override fun fireCorrelatedPair(first: String, second: String) {
        // no-op in release
    }
}
