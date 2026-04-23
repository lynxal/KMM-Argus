# BLE Connection Lifecycle

Managed by `KableBluetoothMeshDevice` wrapping Kable's `Peripheral`.

## Connection State

```kotlin
sealed class BleDeviceState {
    sealed class Connecting : BleDeviceState() {
        object Bluetooth   // L2CAP initiated
        object Services    // Service discovery
        object Observes    // Wiring observers
    }
    object Connected
    object Disconnecting
    data class Disconnected(val status: DisconnectReason?)
}
```

Granular `DisconnectReason`: `PeripheralDisconnected`, `CentralDisconnected`, `Failed`, `L2CapFailure`, `Timeout`, `Cancelled`, `ConnectionLimitReached`, `EncryptionTimedOut`, `Unknown(status)`.

Mapped from Kable's `State` via `toBleDeviceState()` extension.

## MTU Negotiation

- Android: negotiates up to `MaxMTU = 517`
- iOS: fixed value from `CBCentral.maximumUpdateValueLength + 3` (+3 = ATT header)
- Fallback: `SafeMTU = 23` if negotiation fails
- Developers must account for platform MTU differences in segment size calculations

## Service Discovery

On `Connected` state, discovers GATT services:
- Provisioning service: UUID `00001827-...` → sets `hasProvisioningCapabilities = true`
- Proxy service: UUID `00001828-...` → sets `hasProxyCapabilities = true`
- Mutually exclusive: a device is either provisioning or proxy, never both

## Characteristic Observation

Output characteristic observed via `peripheral.observe(characteristic)`:
- Collected bytes routed to `onProxyResponseBytes` or `onProvisioningResponseBytes`
- `outputStreamReady: StateFlow<Boolean>` signals when observer is established
- Observation job cancelled on disconnect

## Write Operations

Always `WriteType.WithoutResponse` (fire-and-forget). Mesh protocol handles reliability at transport layer.

```kotlin
peripheral.write(characteristic, byteArray, writeType = WriteType.WithoutResponse)
```

## Connect/Disconnect

- `connect()`: guarded by `currentState is Disconnected` check, wrapped in `runCatchingCancellable`
- `disconnect()`: guarded by not-already-disconnecting check
- Both return `Boolean` success indicator
