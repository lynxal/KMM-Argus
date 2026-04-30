package com.lynxal.argus.sample.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.StateFlow

@Composable
fun App(
    httpClient: HttpClient,
    argusUrl: StateFlow<String?>,
    onPublishCustom: () -> Unit = {},
    onOkHttpCall: (String) -> Unit = {},
    onUrlConnectionCall: (String) -> Unit = {},
    onCorrelatedPair: (String, String) -> Unit = { _, _ -> },
) {
    MaterialTheme {
        SampleScreen(
            httpClient = httpClient,
            argusUrl = argusUrl,
            onPublishCustom = onPublishCustom,
            onOkHttpCall = onOkHttpCall,
            onUrlConnectionCall = onUrlConnectionCall,
            onCorrelatedPair = onCorrelatedPair,
        )
    }
}
