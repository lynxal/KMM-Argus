# Async Error Handling

## Timeout to Result Mapping

Convert `TimeoutCancellationException` to domain `Result.failure()`:

```kotlin
try {
    withTimeout(30.seconds) {
        while (proxyRestartRequested) {
            delay(0.5.seconds)
        }
    }
} catch (e: TimeoutCancellationException) {
    Logger.error("Proxy reconnection timed out")
    return Result.failure(
        MeshCommunicationException.ProxyReconnectionException("...")
    )
}
```

Never let `TimeoutCancellationException` propagate unhandled — always map to a domain error.

## Mutex Guard for BLE Operations

BLE use cases that access shared hardware must prevent concurrent execution:

```kotlin
private val mutex = Mutex()

suspend fun execute(zoneId: Long): Result<Boolean> {
    if (mutex.isLocked) return Result.failure(
        MeshCommunicationException.AlreadyRunningException("...")
    )

    mutex.withLock {
        if (shouldSkipExecution()) return Result.success(false)
        // ... BLE operation
    }
}
```

- Check `mutex.isLocked` for early exit (non-blocking)
- Use `mutex.withLock` for the critical section
- This pattern is for BLE/mesh operations only — not needed for general use cases

## Retry with Linear Backoff

Project-wide convention for retry logic:

```kotlin
var retryCount = 0
while (isActive) {
    try {
        connection.start()
        break
    } catch (e: Exception) {
        ++retryCount
        delay(min(retryCount * 500L, 5000L))  // 500ms increments, capped at 5s
    }
}
```

- Linear backoff: `count * 500ms`
- Cap at `5000ms` (5 seconds)
- Always check `isActive` in the loop
- Log errors before retrying

## Result Wrapping in withContext

Wrap entire context-switched blocks in try-catch with Result:

```kotlin
return withContext(coroutineContext) {
    try {
        val data = storage.load().getOrThrow()
        Result.success(data)
    } catch (e: Exception) {
        Logger.error("Operation failed", e)
        Result.failure(DomainException.OperationFailed(e.message))
    }
}
```

- Use `getOrThrow()` on inner Results to propagate errors
- Always log before wrapping in `Result.failure()`
- Use domain-specific exception types, not generic exceptions
