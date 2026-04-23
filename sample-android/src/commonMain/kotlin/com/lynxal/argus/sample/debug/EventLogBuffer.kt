package com.lynxal.argus.sample.debug

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class EventLogBuffer(private val capacity: Int = 100) {
    private val _events = MutableStateFlow<List<String>>(emptyList())
    val events: StateFlow<List<String>> = _events.asStateFlow()

    fun append(line: String) {
        _events.update { current ->
            val next = current + line
            if (next.size <= capacity) next else next.takeLast(capacity)
        }
    }
}
