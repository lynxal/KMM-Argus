# Vendor Model Communication

Canvas devices use a custom vendor model (Canvas Wireless Protocol) for control
instead of standard SIG models. The protocol version is defined by
`BluetoothMeshApi.CANVAS_PROTOCOL_VERSION`. Full spec docs and implementation
mapping live in `canvas_mesh_protocol/{CANVAS_PROTOCOL_VERSION}/` — check the
constant for the current version.

## Architecture

```
Screen Model
    → SpaceRepository (address resolution, optimistic updates)
        → CanvasNetworkInteractionDelegate (channel routing)
            → CanvasNetworkBluetoothMeshInteractor (BLE mesh transport)
                → CanvasControlPublishUseCase (message construction + send)
```

## CanvasActionType

The `CanvasActionType` enum (Section 2.21.2) defines all supported control
operations. Each action type is supported by specific models:

| Category           | Types                                                                                | Integration Model | Control Model |
|--------------------|--------------------------------------------------------------------------------------|:-----------------:|:-------------:|
| Global             | `GlobalOnOff`, `GlobalActiveScene`, `GlobalSceneToggle`, `GlobalSceneSeriesDelta`    |        Yes        |      Yes      |
| Native Light       | `LightnessOnOff`, `Lightness`, `CCT`, `Saturation`, `Hue`, `CTL`, `HSL`              |        Yes        |      Yes      |
| Native Light Delta | `LightnessDelta`, `CCTDelta`, `SaturationDelta`, `HueDelta`                          |        Yes        |      Yes      |
| Universal          | `UniversalOnOff`, `UniversalLevel`, `UniversalDelta`                                 |        Yes        |      Yes      |
| Integration        | `IntegrationPress`, `IntegrationHold`, `IntegrationRotate`, `IntegrationPressRotate` |        Yes        |    **No**     |
| Management         | `StatusRequest`                                                                      |      **No**       |      Yes      |
| Management         | `NoAction`, `IgnoreAction`                                                           |        Yes        |      Yes      |

**Routing rule**: Integration-only actions (0xE0-0xE3) must NOT be dispatched
via `CanvasControlData.useByteWalker()`. They flow only through Integration
Info Publish. `StatusRequest` is Control Model only.

## Sending: CanvasControlPublishUseCase

All vendor model control goes through `CanvasControlPublishUseCase`:

```kotlin
canvasControlPublishUseCase.execute(
    address = groupAddress,
    type = CanvasActionType.Lightness,
    data = CanvasControlLightnessData(
        CanvasLightness((lightness * 1000).toUInt())
    ),
    numRepeat = 1,
    numRetry = 3,
    transitionTime = CanvasTransitionTime.from(duration)
)
```

### Value ranges

- Lightness: `CanvasLightness(0u..1000u)` — multiply float 0..1 by 1000. 1023u = Ignore.
- CCT: `CanvasCCT(1000u..15000u)` — Kelvin value directly. 16383u = Ignore.
- Saturation: `CanvasSaturation(0u..1000u)` — 1023u = Ignore.
- Hue: `CanvasHue(0u..3600u)` — 0.1° steps. 4095u = Ignore.
- On/Off: `CanvasOnOffState.On` / `.Off` / `.Toggle` / `.Ignore`

### Transition time & delay

Use `CanvasTransitionTime.from(Duration)` for Duration-based values.
Use `CanvasDelay` for delay fields (not raw UInt).
Special values: `.noTransition` / `.noDelay`, `.invalid`, `.default`, `.ignore`.

## State Query: CanvasControlStatusGetMessage

```kotlin
CanvasControlStatusGetMessage(
    targetDomainMask = CanvasTargetDomainMask.All,  // or .of(CanvasControlDataType.Light)
    applicationKeyId = appKeyIndex,
    dst = address
)
```

The message hardcodes `StatusRequest` action type internally.
`CanvasTargetDomainMask` is a 32-bit bitmask (bit N = domain N).

## Receiving: MeshNetworkStateProcessingDelegate

Incoming `CanvasControlStatus` messages contain:

- `type: CanvasActionType` — which action the actuator is reporting
- `actuatorStatus: CanvasActuatorStatusByte` — power state + automation flag
- `activeSceneID: CanvasSceneID`
- `actionData: CanvasControlData` — polymorphic data based on action type

`CanvasActuatorStatusByte` has a `PowerState` enum (Off/On/Transitioning/Reserved)
and `isAutomation` flag. This is separate from `CanvasOnOffState` (which has
Toggle for action commands).

```kotlin
when (val actionData = modelStatus.actionData) {
    is CanvasControlLightOnOffData -> isOn = actionData.onOffState.state == CanvasOnOffState.On
    is CanvasControlLightnessData -> lightness = actionData.lightnessState.lightness.toFloat() / 1000f
    is CanvasControlCCTData -> colorTemperature = actionData.cctState.cct.toUShort()
    is CanvasControlCTLData -> { lightness = ...; colorTemperature = ... }
    is CanvasControlHSLData -> { hueLevel = ...; saturationLevel = ...; lightness = ... }
}
```

## Native BLE Mesh Models

LC (Light Control) and delta operations use **standard SIG models**:

| Operation | Use Case | Message Type |
|-----------|----------|-------------|
| LC mode set | `LightLcModeSetUseCase` | `LightLcModeSetMessage` |
| LC occupancy mode | `LightLcOccupancyModeSetUseCase` | `LightLcOccupancyModeSetMessage` |
| LC property set | `LightLcPropertySetUseCase` | `LightLcPropertySetMessage` |
| Generic delta | `GenericDeltaSetUseCase` | `GenericDeltaSetMessage` |

## Interactor Interface

`CanvasNetworkInteractorInterface` abstracts all mesh communication:

```kotlin
interface CanvasNetworkInteractorInterface {
    // Vendor model (CanvasControlPublishUseCase)
    suspend fun setSpaceLightness(spaceId: Long, lightness: Float, ...): Result<Unit>
    suspend fun setSpaceLightnessOnOff(spaceId: Long, isTurnedOn: Boolean): Result<Unit>
    suspend fun setSpaceCCT(spaceId: Long, cct: Int): Result<Unit>
    suspend fun setAllLightnessOnOff(isTurnedOn: Boolean): Result<Unit>
    suspend fun setAllGlobalOnOff(isTurnedOn: Boolean): Result<Unit>

    // Native SIG model (dedicated use cases)
    suspend fun setSpaceLightnessDelta(spaceId: Long, delta: Float, ...): Result<Unit>
    suspend fun setSpaceCCTDelta(spaceId: Long, delta: Float, ...): Result<Unit>
    suspend fun setLightLcMode(nodeId: Long, isOccupancy: Boolean): Result<Unit>
    suspend fun setLightLcProperty(nodeId: Long, property: LightLCProperty): Result<Unit>

    // Vendor model state query
    suspend fun refreshSpaceDeviceStates(spaceId: Long): Result<Unit>
}
```

## Address Resolution

- **Space operations**: Interactor resolves group address via
  `meshApi.meshNetworkRepository.getGroupById(spaceId)`
- **Node operations**: SpaceRepository resolves unicast address from
  `NodeStorage` (`node.structure.address + channelOffset`)
- **Broadcast**: Use `0xFFFF` for all-device operations
- **Special addresses**: See `CanvasGroupAddress` for protocol-defined addresses
  (NETWORK_ACTUATORS=0xFE00, NETWORK_CONTROLLERS=0xFE01, HOME=0xFE02, INTEGRATION=0xFE03)

## Protocol Primitive Types

Use protocol-specific types for fields, not raw `UInt`:

- Delay fields → `CanvasDelay` (not `UInt`)
- Transition time → `CanvasTransitionTime`
- Domain mask → `CanvasTargetDomainMask`
- Controller mode → `CanvasControllerMode` (data class wrapper, hardware-specific values)

Each primitive implements `DeserializableState` with `numBytes`, `fromBytes()`,
and a `bytes` property for consistent serialization.

Serialization of lists: use `.fold(byteArrayOf()) { acc, v -> acc + v }`
(not `.reduce {}` which crashes on empty lists).
