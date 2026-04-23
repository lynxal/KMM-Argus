package com.lynxal.argus.model

import com.lynxal.logging.LogLevel
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Wire serializer for KMMLogging's [LogLevel] enum, which upstream is not `@Serializable`.
 *
 * Encodes as the Kotlin enum name ("Verbose", "Debug", "Info", "Warning", "Error") rather
 * than the integer level — the string form is self-describing on the wire and survives
 * any future reordering of the upstream enum.
 */
internal object LogLevelSerializer : KSerializer<LogLevel> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("com.lynxal.logging.LogLevel", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: LogLevel) {
        encoder.encodeString(value.name)
    }

    override fun deserialize(decoder: Decoder): LogLevel =
        LogLevel.valueOf(decoder.decodeString())
}
