package com.lynxal.argus.ktor

import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import com.lynxal.argus.model.HttpEvent

internal open class RecordingEventBus : ArgusEventBus {
    private val recorded = mutableListOf<ArgusEvent>()

    override fun publish(event: ArgusEvent) {
        append(event)
    }

    protected open fun append(event: ArgusEvent) {
        recorded.add(event)
    }

    open val events: List<ArgusEvent> get() = recorded.toList()

    fun httpEvents(): List<HttpEvent> = events.filterIsInstance<HttpEvent>()
}
