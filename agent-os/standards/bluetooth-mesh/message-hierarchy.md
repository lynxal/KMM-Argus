# Message & PDU Hierarchy

All mesh messages follow a layered class hierarchy that mirrors the Bluetooth Mesh spec transport layers:

```
MeshMessage (abstract)
  └─ AccessMessage
      └─ ApplicationMessage
          ├─ [Standard models] GenericOnOffSetMessage, LightLightnessSetMessage, ...
          └─ VendorMessage (abstract)
              ├─ CanvasTransactionalMessage (for set-ack commands)
              └─ [Concrete] CanvasControlStatusGetMessage, ...
```

## Rules

- **All new Canvas features must use `VendorMessage`**, not `ApplicationMessage` directly
- Vendor models inherit from `ApplicationMessage` per BT Mesh spec — this gives them the same crypto, transport, and segmentation infrastructure as standard messages
- Standard `ApplicationMessage` subclasses remain only for config and some generic BT Mesh models

## Opcode Encoding

| Type | Size | Range | Format |
|------|------|-------|--------|
| Standard (1-byte) | 1B | 0x00–0x7E | `0b0xxxxxxx` |
| Standard (2-byte) | 2B | 0x8000–0xBFFF | `0b10xxxxxxxxxxxxxx` |
| Vendor (3-byte) | 3B | 0xC00000–0xFFFFFF | `0b11xxxxxx` + CompanyID (LE) |

Vendor opcodes use `VendorOpcode(vendorOpcode, companyId)` — Canvas uses `CanvasOpcode(vendorOpcode)` which sets `companyId = 0x02FF`.

```kotlin
// Correct: new Canvas message
class MyNewMessage(...) : VendorMessage(
    applicationKeyId, dst,
    OpCode.Application.CanvasControlModel.myNewOpcode
)

// Wrong: don't subclass ApplicationMessage directly for Canvas features
class MyNewMessage(...) : ApplicationMessage(...)
```

## Lazy PDU Generation

- `parameters` and `pdu` are computed lazily via `parametersBuilder()` and `pduBuilder()`
- Messages are effectively immutable after construction
- `parameters` = payload only; `pdu` = opcode prefix + parameters

## Canvas Vendor Models (OpCode.kt)

| Model | Opcode Range | Purpose |
|-------|-------------|----------|
| CanvasIntegrationModel | 0x00–0x03 | Integration publish/property |
| CanvasControlModel | 0x0A–0x10 | Control commands & properties |
| CanvasSetupModel | 0x15–0x1D | Setup store & device parameters |
| CanvasSystemModel | 0x24–0x2A | System & critical properties |
