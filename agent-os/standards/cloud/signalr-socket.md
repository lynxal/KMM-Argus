# SignalR Socket Communication

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

Real-time state updates use SignalR (ASP.NET backend). Library: `signalrkore`.

## Connection Setup

```kotlin
class CloudSocketClientImpl(
    private val spaceRepository: SpaceRepository,
    private val refreshAccessTokenUseCase: RefreshAccessTokenUseCase
) : CloudSocketClient {
    private val mutex = Mutex()
    private var socketConnection: HubConnection? = null
    private var stateObservationJob: Job? = null
    private val collectJobs = mutableListOf<Job>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
}
```

- Endpoint: `BuildKonfig.BASE_URL + "/hubs/mobileHub"`
- Token: lazy provider via `TokenRepository.getAccessToken()`
- Reconnection: `AutomaticReconnect.exponentialBackoff()`
- Start/stop guarded by `Mutex` to prevent race conditions

## Connection Lifecycle

| State | Action |
|-------|--------|
| `CONNECTED` | Register all event handlers |
| `RECONNECTING` | Cancel all collect jobs, refresh access token |
| Other | Cancel all collect jobs |

On initial start, retries with linear backoff (`reconnectCount * 500ms`, max 5s).

## Event Handler Pattern

Every socket event gets a dedicated handler function. Always follow this template:

```kotlin
// C# signature comment: Task ReceiveDeleteNode(long Id);
private fun observeNodeDelete() {
    scope.launch {
        socketConnection?.on(
            target = "ReceiveDeleteNode",
            deserializer1 = Long.serializer()
        )?.collectLatest { arguments ->
            systemLogger.debug("ReceiveDeleteNode - ${arguments.arg1}")
            spaceRepository.removeNodeById(arguments.arg1)
        }
    }.apply { collectJobs.add(this) }
}
```

## Rules

- One function per event — no generic/catch-all handlers
- Comment the C# server signature above each handler
- Use typed serializers (`Long.serializer()`, `Model.serializer()`, `ListSerializer(...)`) — never raw strings
- Add the launched `Job` to `collectJobs` via `.apply { collectJobs.add(this) }`
- Log the event target and payload at `debug` level
- Update repositories directly from handlers — no intermediate transformation layer
- Use `collectLatest` for state events (drop stale), `collect` for cumulative events
