# Multi-Source Composition

Device/space state comes from multiple sources: BLE mesh and cloud API. These are composed transparently.

## Network Interaction Delegate (In Development)

Use `CanvasNetworkInteractionDelegate` to abstract communication channel selection. This delegate is still being developed — its API and routing logic may evolve.

```kotlin
class CanvasNetworkInteractionDelegate(
    private val cloudInteractor: CanvasNetworkCloudInteractor,
    private val meshInteractor: CanvasNetworkBluetoothMeshInteractor
) : CanvasNetworkInteractorInterface {

    override suspend fun setSpaceLightness(spaceId: Long, lightness: Float): Result<Unit> {
        return meshInteractor.setSpaceLightness(spaceId, lightness)
    }
}
```

- Repositories inject the delegate, not individual interactors
- Channel routing logic lives in the delegate — not in repositories or use cases
- Repositories call delegate methods without knowing which channel is used

## Repository Pattern

```kotlin
class SpaceRepository(
    private val spaceStorage: SpaceStorage,
    private val nodeStorage: NodeStorage,
    private val canvasNetworkInteractionDelegate: CanvasNetworkInteractionDelegate
) {
    suspend fun setSpaceLightness(spaceId: Long, lightness: Float): Result<Unit> {
        return canvasNetworkInteractionDelegate.setSpaceLightness(spaceId, lightness)
    }

    suspend fun setNodeLightness(nodeId: Long, lightness: Float): Result<Unit> {
        // Repository resolves address and validates luminary capability
        val node = nodeStorage.getCachedNode(nodeId) ?: return Result.failure(...)
        if (!node.structure.isLuminary) return Result.failure(...)
        val channelEntry = node.structure.channels.entries
            .firstOrNull { it.value.supportsLevel() } ?: return Result.failure(...)
        val address = node.structure.address.toInt() + channelEntry.key
        return canvasNetworkInteractionDelegate.setNodeLightness(address, lightness)
    }
}
```

### Node control uses node ID, not UUID

Node-level control methods (`setNodeLightness`, `setNodeOnOff`) accept `nodeId: Long` — the backend-assigned identifier. This is required because the cloud API expects node ID for remote control. The UUID-to-ID resolution happens at the screen model layer before calling the repository.

The interactor interface accepts a resolved `address: Int` for node methods. Address resolution (node ID → unicast address + channel offset) and luminary validation are the repository's responsibility, keeping interactors focused on message transport.

## State Flow Composition

When combining state updates from multiple sources, use `Flow.combine()`:

```kotlin
val spaceUpdates: Flow<Set<Long>> =
    meshStorage.spaceUpdateFlow.combine(remoteStorage.spaceUpdateFlow) { mesh, remote ->
        (mesh + remote).toSet()
    }
```

## Conflict Resolution

- Most recent update wins when mesh and remote return conflicting state
- Timestamps or sequence numbers determine recency

## Deprecated: `preferSendingOverBluetoothMesh()`

`StateRepositoryImpl.preferSendingOverBluetoothMesh()` with inline `if/else` routing is deprecated. Use `CanvasNetworkInteractionDelegate` instead. Migrate when touching affected code.
