package com.lynxal.argus.sample.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lynxal.logging.LogLevel
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.StateFlow

private const val USERS_URL = "https://jsonplaceholder.typicode.com/users/1"
private const val POSTS_URL = "https://jsonplaceholder.typicode.com/posts"
private const val IMAGE_URL = "https://picsum.photos/200"
private const val FAILING_URL = "https://this-host-does-not-exist-argus-test.invalid/"

@Composable
fun SampleScreen(
    httpClient: HttpClient,
    argusUrl: StateFlow<String?>,
) {
    val scope = rememberCoroutineScope()
    val actions = SampleActions(httpClient, scope)
    val url by argusUrl.collectAsState()

    Scaffold { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    text = "Argus Sample",
                    style = MaterialTheme.typography.headlineSmall,
                )
            }

            url?.let { bound ->
                item {
                    SelectionContainer {
                        Text(
                            text = "Argus: $bound",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            item { FullWidthButton("GET /users/1") { actions.onGet(USERS_URL) } }
            item { FullWidthButton("GET /posts") { actions.onGet(POSTS_URL) } }
            item { FullWidthButton("GET image (200x200)") { actions.onGet(IMAGE_URL) } }
            item { FullWidthButton("GET failing host") { actions.onGet(FAILING_URL) } }

            item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }

            item { FullWidthButton("Emit VERBOSE log") { actions.onEmit(LogLevel.Verbose, "Emit VERBOSE log") } }
            item { FullWidthButton("Emit DEBUG log") { actions.onEmit(LogLevel.Debug, "Emit DEBUG log") } }
            item { FullWidthButton("Emit INFO log") { actions.onEmit(LogLevel.Info, "Emit INFO log") } }
            item { FullWidthButton("Emit WARN log") { actions.onEmit(LogLevel.Warning, "Emit WARN log") } }
            item { FullWidthButton("Emit ERROR log (with throwable)") { actions.onEmit(LogLevel.Error, "Emit ERROR log (with throwable)") } }
        }
    }
}

@Composable
private fun FullWidthButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(label)
    }
}
