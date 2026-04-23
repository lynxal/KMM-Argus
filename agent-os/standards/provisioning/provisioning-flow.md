# Provisioning Flow

## Overview

Two-phase process: BLE Provisioning (8 mesh steps) → Post-Provisioning Configuration (7 app steps).

This standard covers phase 1. See `configuration-binding` for phase 2.

## BLE Provisioning Steps

Orchestrated by `StaticProvisioningUseCase`:

```
1. Invite          → Send attention timer (3s)
2. Capabilities    ← Device responds with supported features
3. Start           → Begin provisioning method
4. PublicKey        ↔ ECDH key exchange (shared secret)
5. Confirmation     ↔ Generate and verify confirmation values
6. Random           ↔ Random value exchange for final validation
7. Data             → Send encrypted: network key, device key, unicast address, IV index
8. Complete/Failed  ← Device confirms or reports failure
```

## Timeouts

| Scope | Duration | Purpose |
|-------|----------|--------|
| Global | 60 seconds | Entire provisioning flow |
| Per-operation | 10 seconds | Each individual step |

```kotlin
val result = withTimeoutOrNull(provisioningGlobalTimeout) {
    val caps = withTimeoutOrNull(provisioningOperationTimeout) {
        meshApiInternal.waitForProvisioningInfo(deviceUuid) { _, info ->
            info is ProvisioningInfo.Capabilities
        }
    } ?: return@withTimeoutOrNull failAndCleanup(...)
}
```

## Failure Handling

Sealed exception hierarchy in `ProvisioningException`:

- `AlreadyRunningException` — prevent double provisioning
- `DeviceNotFoundException` — BLE scan failed
- `CapabilitiesMissingException` — step 2 timeout
- `ConfirmationMismatchException` — security validation failed
- `TimeoutException` — global 60s exceeded

On failure, always clean up:

```kotlin
private suspend fun failAndCleanup(...): Result<Boolean> {
    meshApi.resetProvisioningData(deviceUuid)  // Clear partial state
    deviceWrapper.device?.disconnect()
    return failReason
}
```

## UI State Machine

```
Idle → Provisioning(message) → Provisioned(deviceInfo)
                              → Error(message) → [retry] → Provisioning
```

- Progress tracked via `ProgressIndicatorDelegate`
- UI labels update per step via `nextStep(message)`

## Spec Fail Codes

`ProvisioningFailCodes` enum maps Bluetooth Mesh spec codes:
`PROHIBITED`, `INVALID_PDU`, `CONFIRMATION_FAILED`, `OUT_OF_RESOURCES`, `DECRYPTION_FAILED`, etc.
