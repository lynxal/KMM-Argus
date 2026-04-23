package com.lynxal.argus.sample

import android.app.Application
import com.lynxal.argus.sample.debug.DebugTools
import com.lynxal.argus.sample.debug.DebugToolsImpl
import io.ktor.client.HttpClient

class SampleApp : Application() {
    lateinit var debugTools: DebugTools
        private set
    lateinit var httpClient: HttpClient
        private set

    override fun onCreate() {
        super.onCreate()
        debugTools = DebugToolsImpl(this)
        debugTools.installLogging()
        httpClient = debugTools.buildHttpClient()
    }
}
