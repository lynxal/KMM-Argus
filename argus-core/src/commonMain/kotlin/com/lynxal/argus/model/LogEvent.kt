@file:UseSerializers(LogLevelSerializer::class)

package com.lynxal.argus.model

import com.lynxal.logging.LogLevel
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers

@Serializable
@SerialName("LogEvent")
public data class LogEvent(
    override val id: String,
    override val timestamp: Long,
    override val source: EventSource = EventSource.LOG,
    val level: LogLevel,
    val tag: String? = null,
    val message: String,
    val payload: Map<String, String> = emptyMap(),
    val throwable: ThrowableInfo? = null,
    val correlationId: String? = null,
) : ArgusEvent
