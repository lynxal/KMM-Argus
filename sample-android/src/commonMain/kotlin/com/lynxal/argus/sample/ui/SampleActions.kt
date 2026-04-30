package com.lynxal.argus.sample.ui

import com.lynxal.argus.correlation.withCorrelation
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

    /**
     * Fire two HTTP calls back-to-back inside the same `withCorrelation` scope so the
     * resulting `HttpEvent`s and any log lines emitted between them share one correlation
     * id in the inspector. Useful for eyeballing the optional correlationId column.
     */
    fun onCorrelatedPair(first: String, second: String) {
        scope.launch(Dispatchers.Default) {
            withCorrelation {
                val logger = Logger.tag("Argus sample")
                logger.info { message = "correlated-pair: starting" }
                runCatching { client.get(first) }
                logger.info { message = "correlated-pair: first done, firing second" }
                runCatching { client.get(second) }
                logger.info { message = "correlated-pair: done" }
            }
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
