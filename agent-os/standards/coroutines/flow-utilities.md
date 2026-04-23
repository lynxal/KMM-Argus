# Flow & Coroutine Utilities

## runCatchingCancellable — Project-Wide Replacement for runCatching

**Always use `runCatchingCancellable` instead of `runCatching` in coroutine contexts.**

Kotlin's `runCatching` swallows `CancellationException`, breaking structured concurrency.
`runCatchingCancellable` re-throws it:

```kotlin
suspend fun <T, R> T.runCatchingCancellable(block: suspend T.() -> R): Result<R> {
    try {
        return Result.success(block())
    } catch (e: Throwable) {
        if (e is CancellationException) throw e
        return Result.failure(e)
    }
}
```

Usage:

```kotlin
// WRONG — swallows CancellationException
val result = runCatching { someApi.fetch() }

// CORRECT
val result = runCatchingCancellable { someApi.fetch() }
```

Located in: `common/src/commonMain/.../utils/ExceptionUtils.kt`

## bufferedFlow — Batch Fast-Emitting Flows

Collects rapidly emitting items into batches emitted at a fixed interval:

```kotlin
fun <T> Flow<T>.bufferedFlow(duration: Duration): Flow<List<T>>
```

- Collects items into a `Mutex`-protected `MutableSet`
- Emits accumulated items every `duration` interval
- Emits `emptyList()` initially
- Uses `channelFlow` + `collectLatest` for concurrent collection and emission
- Deduplicates items within each batch window (uses `Set`)

```kotlin
// Batch BLE scan results into 500ms windows
scanResultsFlow
    .bufferedFlow(500.milliseconds)
    .collect { batch -> updateUI(batch) }
```

Located in: `common/src/commonMain/.../utils/FlowUtils.kt`
