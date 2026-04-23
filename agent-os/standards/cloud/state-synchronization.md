# Remote State Synchronization

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

The app manages device state through two parallel systems with three control modes.

## Control Modes (Design Decision — Not Yet Implemented)

| Mode | Remote (API) | Local (BLE Mesh) | Fallback |
|------|-------------|-------------------|----------|
| **Auto** | Primary when available | Enabled if remote unavailable | Yes |
| **Remote** | Always | Disabled | No — no connection if API unavailable |
| **Local** | Disabled | Always | No — mesh only |

Auto is the default mode (and currently the only implemented mode). Mesh communication is disabled when remote is both enabled and available:

```kotlin
meshNetworkStateStorage.setMeshCommunicationEnabled(
    !(remoteNetworkStateStorage.rcEnabled && remoteNetworkStateStorage.remoteStateAvailable)
)
```

## State Flow

1. **Get state:** `RemoteStateService.getNetworkState()` returns spaces + hubs
2. **Convert:** `RemoteZoneState.from(response)` / `RemoteHubState.from(response)` — companion factory
3. **Store:** `remoteNetworkStateStorage.processZoneData(zones, hubs)`
4. **Fallback:** If API succeeds but returns null data → `setRemoteStateUnavailable()`

## Set State Use Cases

Each state mutation has a dedicated use case. Pattern:

```kotlin
class SetRemoteNodeOnOffStateUseCase(
    private val remoteStateService: RemoteStateService,
    private val transactionIdRepository: TransactionIdRepository
) : UseCase {
    suspend fun execute(
        nodeUuid: String,
        isOn: Boolean,
        initialDelay: Duration? = null,
        transitionTime: Duration? = null
    ): Result<Unit> =
        remoteStateService.setNodeOnOffState(
            nodeUuid, SetOnOffStateRequest(
                transactionId = transactionIdRepository.getNextTransactionId(),
                transitionTime = transitionTime?.inWholeMilliseconds,
                delay = initialDelay?.inWholeMilliseconds,
                onOff = if (isOn) 1 else 0
            )
        )
}
```

## Rules

- Always get `transactionId` from `TransactionIdRepository` for state mutations
- Convert `Duration` to milliseconds at the request boundary
- Convert booleans to Int (0/1) at the request boundary
- `companion object { fun from() }` for state conversions — preferred but not mandatory, use what fits the context
- One use case per state mutation type (OnOff, Lightness, CTL, etc.)
- Real-time updates arrive via SignalR (see `signalr-socket.md`) and update repositories directly
