package com.lynxal.argus.sample

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.lynxal.argus.sample.ui.App

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as SampleApp
        setContent {
            App(
                httpClient = app.httpClient,
                eventLog = app.debugTools.observeEventLog(),
            )
        }
    }
}
