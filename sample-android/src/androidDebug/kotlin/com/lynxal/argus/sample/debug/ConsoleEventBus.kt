package com.lynxal.argus.sample.debug

import android.util.Log
import com.lynxal.argus.model.ArgusEvent
import com.lynxal.argus.model.ArgusEventBus
import kotlinx.serialization.json.Json

// Temporary: replaced by ArgusServer's ChannelEventBus when :argus-android lands.
class ConsoleEventBus(
    private val tag: String,
    private val sink: EventLogBuffer,
) : ArgusEventBus {
    private val json = Json { prettyPrint = false; ignoreUnknownKeys = true }

    override fun publish(event: ArgusEvent) {
        val line = json.encodeToString(ArgusEvent.serializer(), event)
        Log.d(tag, line)
        sink.append(line)
    }
}
