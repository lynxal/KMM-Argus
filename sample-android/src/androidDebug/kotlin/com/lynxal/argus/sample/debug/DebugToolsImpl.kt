package com.lynxal.argus.sample.debug

import android.app.Application
import com.lynxal.argus.ktor.Argus
import com.lynxal.argus.logging.ArgusLoggerDelegate
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.logging.DebugLoggerImplementation
import com.lynxal.logging.LogLevel
import com.lynxal.logging.Logger
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.StateFlow

// Temporary wiring: plugin + delegate point at ConsoleEventBus for now.
// Replaced by ArgusServer's ChannelEventBus when :argus-android lands.
class DebugToolsImpl(@Suppress("unused") private val app: Application) : DebugTools {
    private val buffer = EventLogBuffer()
    private val bus: ArgusEventBus = ConsoleEventBus(tag = "Argus", sink = buffer)

    override fun buildHttpClient(): HttpClient = HttpClient(CIO) {
        install(Argus) {
            eventBus = bus
            maxBodyBytes = 262_144L
        }
        install(ContentNegotiation) {
            json()
        }
    }

    override fun installLogging() {
        Logger.minLevel = LogLevel.Verbose
        Logger.add(DebugLoggerImplementation())
        Logger.add(ArgusLoggerDelegate(bus))
    }

    override fun observeEventLog(): StateFlow<List<String>> = buffer.events
}
