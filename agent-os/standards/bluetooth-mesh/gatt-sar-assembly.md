# GATT SAR Assembly

Segmentation and Reassembly for BLE mesh PDUs. Handled by `AbstractBleConnectionManager`.

## SAR Types

```kotlin
enum class GattSarType(val value: Byte) {
    None(0x00),        // Complete single-frame message
    Start(0b01),       // First segment
    Continuation(0b10), // Middle segment(s)
    End(0b11)          // Last segment
}
```

Encoded in top 2 bits (bits 7-6) of first byte. Lower 6 bits = PDU type.

## Inbound Assembly State Machine

Single `partialResponse: PartialResponse?` field per manager:
- `None` → emit `AssembledMessage` immediately, clear partial
- `Start` → create new `PartialResponse(device, messageType, data)`
- `Continuation` → validate device+messageType match, append data
- `End` → validate match, append final data, emit assembled, clear partial

Cleanup: next `Start` overwrites any stale partial. No explicit timeout needed — single-threaded `limitedParallelism(1)` scope prevents concurrent assembly.

## Validation

- Device identifier must match across all segments
- Message type must match across all segments
- Mismatches logged as errors, segment discarded

## Outbound Segmentation

`SegmentedMessage(inputPdu, mtu)` splits outbound PDUs:
- If input ≤ MTU: single frame with `GattSarType.None`
- Otherwise: split into `(mtu - 1)` byte chunks tagged Start/Continuation/End

## Common Mistake

Byte order confusion when parsing SAR headers. Top 2 bits are SAR type, not bottom 2.
