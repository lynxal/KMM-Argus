# ByteWalker Deserialization

Mesh messages contain variable-length and optional fields.
`ByteWalker` is a cursor-based parser that tracks byte offset
automatically, preventing off-by-one errors in positional slicing.

## ByteWalker Usage

```kotlin
fun from(msg: AccessMessageModelStatus): GenericOnOffStatus {
    return ByteWalker(msg.parameters).let { bw ->
        val presentOnOff = bw.deserialize(OnOffState)
        val (targetOnOff, remainingTime) = bw.deserializePairIfPresent(
            OnOffState, GenericTransitionTimeState
        )
        GenericOnOffStatus(presentOnOff, targetOnOff, remainingTime)
    }
}
```

Key methods:
- `deserialize(state)` — read exactly `state.numBytes`, advance cursor
- `deserializeIfPresent(state)` — read if bytes remain, else null
- `deserializePairIfPresent(s1, s2)` — read both or neither
- `deserializeList(state)` — consume remaining bytes in chunks

## DeserializableState on Companion Object

**All MeshState types must implement `DeserializableState` on
their companion object.** This makes the type both a value
and its own factory/parser.

```kotlin
enum class OnOffState(val value: Int) : MeshState {
    OFF(0), ON(1), UNKNOWN(2);

    // Serialization: instance -> bytes
    val bytes: ByteArray =
        Bytes.fromInteger(value, 1, LITTLE_ENDIAN).data

    // Deserialization: bytes -> instance (on companion)
    companion object : DeserializableState<OnOffState> {
        override val numBytes: Int = 1
        override fun fromBytes(bytes: List<Byte>): OnOffState =
            when (Bytes(bytes.take(numBytes), LITTLE_ENDIAN).toInteger()) {
                0 -> OFF; 1 -> ON; else -> UNKNOWN
            }
    }
}
```

## Pattern for New State Types

1. Implement `MeshState`
2. Add `companion object : DeserializableState<YourType>`
3. Set `numBytes` to the fixed byte count
4. Implement `fromBytes()` for deserialization
5. Add a `bytes` property or `asByte` for serialization

For bit-packed fields (common in vendor states):

```kotlin
data class CanvasTransitionTime(
    val numSteps: Int,           // 6 bits
    val stepResolution: CanvasTimeResolution  // 2 bits
) : MeshState {
    companion object : DeserializableState<CanvasTransitionTime> {
        override val numBytes: Int = 1
        override fun fromBytes(bytes: List<Byte>): CanvasTransitionTime {
            val input = Bytes(bytes.take(1), LITTLE_ENDIAN).toInteger() and 0xFF
            return CanvasTransitionTime(
                numSteps = input and 0x3F,
                stepResolution = CanvasTimeResolution.fromBits(input shr 6)
            )
        }
    }
    val asByte: Byte
        get() = ((numSteps and 0x3F) or (stepResolution.bits shl 6)).toByte()
}
```
