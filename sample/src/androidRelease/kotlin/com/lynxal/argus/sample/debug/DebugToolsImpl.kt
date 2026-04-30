// Invariant: this file must not import anything from com.lynxal.argus.*
// Enforced by :sample:verifyReleaseHasNoArgus (dexdump the release APK for
// com/lynxal/argus/, io/ktor/server/, com/lynxal/argus/webui/ — fail if any are present).
package com.lynxal.argus.sample.debug

import android.app.Application
import com.lynxal.logging.DebugLoggerImplementation
import com.lynxal.logging.Logger
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DebugToolsImpl(@Suppress("unused") private val app: Application) : DebugTools {
    private val empty: StateFlow<String?> = MutableStateFlow<String?>(null).asStateFlow()

    override fun buildHttpClient(): HttpClient = HttpClient(CIO) {
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
