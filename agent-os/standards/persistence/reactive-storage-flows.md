# Reactive Storage Flows

Storage classes expose reactive flows so subscribers receive updates without polling.

## Flow Type Selection

**State flows** (latest value matters) — use `replay = 1`:
- New subscribers immediately get the last known state
- Example: `hasOnlineHubFlow`, `developerModeEnabledFlow`

```kotlin
private val _stateFlow = MutableSharedFlow<SpaceState>(
    replay = 1,
    extraBufferCapacity = 0,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
)
```

**Update/event flows** (only new emissions matter) — use `replay = 0`:
- Subscribers only receive updates emitted after subscription
- Example: `nodeStateChangeFlow`, `spaceStateUpdates`

```kotlin
private val _updateFlow = MutableSharedFlow<String>(
    replay = 0,
    extraBufferCapacity = 1000,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
)
```

## Buffer Sizing

- High-frequency updates (mesh state, node changes): `extraBufferCapacity = 500–1000`
- Low-frequency state (hub status, settings): `extraBufferCapacity = 0–1`
- Always use `BufferOverflow.DROP_OLDEST` — never suspend producers

## Emit After Every Write

Every storage write must emit to its corresponding flow:

```kotlin
override suspend fun setFoo(foo: Foo) {
    mutex.withLock {
        cache[foo.id] = foo
    }
    _fooUpdateFlow.tryEmit(foo.id)  // Notify subscribers
}
```

## Debounced Consumption

For high-frequency flows, consumers can buffer updates:

```kotlin
override val nodeUpdateFlow: Flow<List<String>> =
    _nodeUpdateFlow.bufferedFlow(300.milliseconds)
```

This batches rapid-fire emissions into periodic lists.

## Reactive Property Setter

For simple boolean/enum state, use a custom property setter:

```kotlin
private var hasOnlineHub: Boolean = false
    set(value) {
        if (field != value) {
            field = value
            hasOnlineHubFlow.tryEmit(field)
        }
    }
```

Only emits on actual change — avoids redundant notifications.
