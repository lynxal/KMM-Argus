# Job Lifecycle

## Cancel Before Restart

Always cancel the previous job before launching a replacement:

```kotlin
private var collectionJob: Job? = null

fun startCollecting(flow: Flow<T>) {
    collectionJob?.cancel()
    collectionJob = coroutineScope.launch {
        flow.collect { process(it) }
    }
}
```

Never assume the old job completed — always explicitly cancel.

## Polling vs Flow Observation

**Polling loops** (`while(isActive) { delay() }`) for logic updates and critical operations:
- Simpler control over execution, easier recovery
- Used for: connectivity checks, state recalculation, batched updates

```kotlin
coroutineScope.launch {
    while (isActive) {
        updateDeviceConnectivityState()
        delay(1.seconds)
    }
}
```

**Flow observation** for state/status monitoring:
- Reactive, event-driven
- Used for: connection state, model status, UI state changes
- May fail silently in the chain — requires more careful error handling

## BLE Message Acknowledgement Pattern

Bluetooth mesh messages arrive through flows. For commands needing acknowledgement:

**Option 1:** Implement `AcknowledgedMessage` — `BluetoothMeshApi` handles tracking automatically.

**Option 2:** Manual stream observation when `AcknowledgedMessage` isn't feasible:

```kotlin
var observationJob: Job? = null
val commandJob = scope.launch {
    sendCommand()
    delay(timeout)
    // Retry logic
    observationJob?.cancel()
}

observationJob = scope.launch {
    meshApi.modelStatusFlow.collectLatest { status ->
        processStatus(status)
        if (allStatesReceived()) cancel()
    }
}

observationJob.join()
commandJob.cancel()
```

Two concurrent jobs: one sends commands with retries, one observes responses. Whichever completes first cancels the other.

## Multiple Independent Jobs

When a delegate manages several recurring tasks, each gets its own job variable:

```kotlin
private var collectionJob: Job? = null
private var connectivityJob: Job? = null
private var stateUpdateJob: Job? = null

fun start(flow: Flow<T>) {
    collectionJob?.cancel()
    collectionJob = scope.launch { /* ... */ }

    connectivityJob?.cancel()
    connectivityJob = scope.launch { /* 1s polling */ }

    stateUpdateJob?.cancel()
    stateUpdateJob = scope.launch { /* 300ms batching */ }
}
```
