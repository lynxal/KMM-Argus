# bluetooth-mesh/control-throttling

## When to Use

Any continuous slider that drives BLE mesh messages (lightness, color temperature, hue, saturation)
MUST use `MeshControlThrottler` to rate-limit outgoing messages while guaranteeing the final value
is always delivered. This applies to both **node-level** and **space-level** controls.

## Pattern

### Setup

```kotlin
private val lightnessThrottleInterval = 200.milliseconds

private val throttler = MeshControlThrottler(
    minInterval = lightnessThrottleInterval,
    scope = executionScope,  // BLE-scoped CoroutineScope
    send = { targetId, value, isFinal ->
        repository.setProperty(
            id = resolveId(targetId),
            value = value,
            numRepeat = if (isFinal) 3 else 1,
            transitionTime = lightnessThrottleInterval * 1.5
        )
    }
)
```

### targetId Convention

`MeshControlThrottler` uses `String` for `targetId` to stay generic:

- **Node controls**: pass `deviceUuid` directly
- **Space controls**: pass `spaceId.toString()`, parse back with `toLongOrNull()` in the send lambda

### Wiring

1. On slider value change: call `throttler.onValueChanged(targetId, value)`
2. On slider change finished: call `throttler.onFinished(targetId, value)`

Both callbacks must be wired through the UI action sealed class:

- `On<Target><Property>Change` — routes to `throttler.onValueChanged()`
- `On<Target><Property>ChangeFinished` — routes to `throttler.onFinished()`

Where `<Target>` is `Device` or `Space` (or `CanvasItem` for dashboard items).

### Shared Throttler Across Screens

When the same control type appears in multiple screens (e.g., space lightness on both Home and
SpaceDetails), each screen model creates its own throttler instance with the same configuration.

## numRepeat Convention

| Message Type               | numRepeat | Rationale                                                 |
|----------------------------|-----------|-----------------------------------------------------------|
| Intermediate (during drag) | 1         | Best-effort; next message will correct any loss           |
| Final (on finger-up)       | 3         | Reliable delivery; ensures light settles at correct value |

## transitionTime Convention

Set `transitionTime = minInterval * 1.5` so the light smoothly interpolates between throttled
messages. The `Duration` value is converted to `CanvasTransitionTime` (numSteps + resolution) inside
`CanvasNetworkBluetoothMeshInteractor`.

## transactionId

Each BLE message auto-generates a new transaction ID via `TransactionIdRepository` inside
`CanvasControlPublishUseCase`. The throttler does not manage transaction IDs.

## Algorithm Properties

- First event sends immediately (no initial delay)
- During continuous drag: at most 1 message per `minInterval`, always the latest value
- On pause mid-drag: trailing iteration fires the latest pending value
- On finger-up: cancels consumer loop, sends final value immediately (fire-and-forget)
- BLE-aware: `send()` is suspend, so if BLE takes longer than `minInterval`, the loop naturally
  slows down

## Canonical Implementation

`shared/src/commonMain/kotlin/com/lynxal/canvasprovisioner/domain/useCase/mesh/MeshControlThrottler.kt`
