# Repository Pattern

All repositories implement `RepositoryInterface` (even if `reset()` is a no-op).

## Structure

```kotlin
interface FooRepository : RepositoryInterface {
    val stateFlow: Flow<FooState>
    suspend fun doSomething(): Result<Bar>
}

class FooRepositoryImpl(
    private val meshStorage: MeshFooStorage,
    private val remoteStorage: RemoteFooStorage,
) : FooRepository {
    override suspend fun reset() { /* clear caches */ }
}
```

## Rules

- Separate interface and implementation files
- Every repository implements `RepositoryInterface` with `reset()` — even if empty
- Use `Flow<T>` for reactive state exposure
- Register as `single()` in Koin (stateful singletons)

## Multi-Source Composition

Repositories combine mesh (local Bluetooth) and remote (cloud) data:

```kotlin
val stateFlow: Flow<State> =
    meshStorage.flow.combine(remoteStorage.flow) { mesh, remote ->
        (mesh + remote).toSet()
    }
```

## Communication Mode (Canvas Mesh Control)

Three modes determine which data source is used for mesh control:

- **Auto** (default) — Use remote API when HUB + Internet available;
  fall back to local Bluetooth Mesh Proxy
- **Remote** — Force remote APIs regardless of local availability
- **Local** — Force local mesh communication regardless of
  remote availability

Device setup always uses local mesh (provisioning via BLE,
configuration via Bluetooth Mesh Proxy after reboot).
