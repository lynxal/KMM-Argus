package com.lynxal.argus.sample.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.StateFlow

@Composable
fun App(
    httpClient: HttpClient,
    eventLog: StateFlow<List<String>>,
) {
    MaterialTheme {
        SampleScreen(httpClient = httpClient, eventLog = eventLog)
    }
}
