package com.lynxal.argus.sample.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.StateFlow

@Composable
fun App(
    httpClient: HttpClient,
    argusUrl: StateFlow<String?>,
) {
    MaterialTheme {
        SampleScreen(httpClient = httpClient, argusUrl = argusUrl)
    }
}
