package com.lynxal.argus.sample

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.lynxal.argus.sample.ui.App

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as SampleApp
        val tools = app.debugTools
        setContent {
            App(
                httpClient = app.httpClient,
                argusUrl = tools.observeArgusUrl(),
                onPublishCustom = {
                    tools.publishCustom(
                        source = "sample",
                        label = "demo-event",
                        payload = "Hello from the sample app",
                    )
                },
                onOkHttpCall = { url -> tools.fireOkHttpCall(url) },
                onUrlConnectionCall = { url -> tools.fireUrlConnectionCall(url) },
                onCorrelatedPair = { first, second -> tools.fireCorrelatedPair(first, second) },
            )
        }
    }
}
