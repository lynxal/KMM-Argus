package com.lynxal.argus.sample.ui

import com.lynxal.logging.LogLevel
import com.lynxal.logging.Logger
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SampleActions(
    private val client: HttpClient,
    private val scope: CoroutineScope,
) {
    fun onGet(url: String) {
        scope.launch(Dispatchers.Default) {
            runCatching { client.get(url) }
        }
    }

    fun onEmit(level: LogLevel, action: String) {
        val logger = Logger.tag("Argus sample")
        val payload = mapOf("source" to "sample", "action" to action)
        when (level) {
            LogLevel.Verbose -> logger.verbose {
                message = "sample verbose"
                this.payload = payload
            }
            LogLevel.Debug -> logger.debug {
                message = "sample debug"
                this.payload = payload
            }
            LogLevel.Info -> logger.info {
                message = "sample info"
                this.payload = payload
            }
            LogLevel.Warning -> logger.warning {
                message = "sample warning"
                this.payload = payload
            }
            LogLevel.Error -> logger.error {
                message = "sample error"
                this.payload = payload
                cause = RuntimeException("sample error", IllegalStateException("inner cause"))
            }
        }
    }
}
