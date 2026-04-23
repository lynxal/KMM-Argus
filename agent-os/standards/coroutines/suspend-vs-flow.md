# Suspend vs Flow

## When to Use Each

**`suspend fun`** — one-shot operations:
- Fetch, save, calculate, send command
- Returns `Result<T>` or a value

```kotlin
suspend fun execute(data: Input): Result<Output>
```

**`Flow<T>`** — reactive state/status observation:
- Connection state, device updates, UI state streams
- Emits multiple values over time

```kotlin
val connectionState: Flow<BleDeviceState>
```

## CoroutineScope Injection

Inject a custom `CoroutineScope` via DI only when required:

- **Single-threaded execution:** `Dispatchers.IO.limitedParallelism(1)` for serialized DB/mesh access
- **Outliving UI lifecycle:** Device configuration, provisioning, or any long-running BLE operation that must not cancel when the app is minimized
- **Specific dispatcher:** Operations needing Main thread for state updates

```kotlin
// Inject scope when operation must survive app backgrounding
class ConfigureDeviceUseCase(
    private val coroutineScope: CoroutineScope  // Not viewModelScope
) : UseCase {
    suspend fun execute(config: DeviceConfig): Result<Unit> =
        withContext(coroutineScope.coroutineContext) {
            // Won't cancel if user minimizes the app
        }
}
```

Do **not** inject scope when the caller's context is fine (simple data transforms, quick reads).

## withContext for Dispatcher Switching

Switch to Main for UI state updates around long operations:

```kotlin
withContext(Dispatchers.Main) {
    setZonesUpdating(zoneId, true)
}
// ... long BLE operation ...
withContext(Dispatchers.Main) {
    setZonesUpdating(zoneId, false)
}
```

## Polling Flow Builder

For repeating emissions with no upstream flow:

```kotlin
val nearbyProxies: Flow<Map<Int, String>> = flow {
    while (currentCoroutineContext().isActive) {
        emit(scanForDevices())
        delay(5.seconds)
    }
}
```

Use `currentCoroutineContext().isActive` for cancellation awareness.
