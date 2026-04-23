# Configuration & Binding

## Post-Provisioning Configuration

After BLE provisioning succeeds, `ConfigureDeviceV2UseCase` runs 9 sequential steps:

```
Step 1: Fetch device composition (models, elements)
Step 2: Setup features (proxy/relay/friend)
Step 3: Assign keys (network + app keys)
Step 4: Bind app keys to supported models
Step 5: Bind to sub-space (if device is in a sub-space)
Step 6: Bind to space
Step 7: Bind to home
Step 8: Bind to device-type address
Step 9: Set device action type
```

Progress tracked via `ProgressIndicatorDelegate(12)` (includes pre/post steps).

## Space Hierarchy

```
Home (root)
  └─ Area (group of spaces) — NOT YET SUPPORTED in config flow
      └─ Space
          └─ Sub-space
```

Initial configuration binds to: **Home + Space + Sub-space**.

## Binding Order: Bottom-Up

**Always bind from lowest level up**: sub-space → space → home.

This ensures publication is set at the most specific level first. Example: a dimmer in a sub-space publishes to the sub-space, not the parent space.

1. **Sub-space binding** (if device is in a sub-space)
   - Sets publication at the sub-space level
   - `overridePublications = true`
2. **Space binding**
   - Adds subscriptions at space level
   - `overridePublications = false` (preserves sub-space publication)
3. **Home binding**
   - Scene servers subscribe to home for scene recalls
   - Master controllers publish scenes to home

## Per-Model Pub/Sub Rules

Each model's publication/subscription is resolved by device role:

```kotlin
fun resolveAddressesToBind(
    model: MeshModel, ...
): Pair<UInt?, UInt?>?  // (publication, subscription)
```

| Model | Light (server) | Dimmer (client) | Master Controller |
|-------|---------------|-----------------|-------------------|
| GenericOnOffServer | sub: space | — | — |
| GenericOnOffClient | — | pub: space | — |
| SceneServer | sub: space | sub: space | sub: space |
| SceneClient | — | pub: space | pub: home |
| CanvasControl | sub: space | pub: space | — |

- `pub` = publication address (device sends here)
- `sub` = subscription address (device listens here)
- "space" = whichever level is being bound (sub-space, space, or home)
- Master controllers publish scenes to home (global reach)

## Key Assignment

`AssignDeviceKeysUseCase` assigns:
- **Network Key**: Primary (index 0)
- **App Keys**: Default + custom per model needs

**Key assignment vs model binding are distinct.** Step 3 (`AssignDeviceKeysUseCase`) makes the app keys known to the node. Step 4 (`BindModelAppKeysUseCase`) authorises each model on each element to use a specific app key — without it the model cannot process traffic encrypted with that key. `BindModelAppKeysUseCase` iterates `resolveAppKeysList()` per element × model and issues `ConfigModelAppBind` only when the key is not already bound. This step is decoupled from publication/subscription setup so that models whose `resolveAddressesToBind()` returns `null` (e.g., `CanvasControl` on a button/rotary bound at Home level) still receive their app-key binding.

## Configuration Completion

After all steps: `meshApi.meshNetworkRepository.setNodeConfigDone(address, true)`
