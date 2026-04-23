# DI Threading Model

CoroutineScopes are injected via Koin with named qualifiers per
`DataSourceType`. Each data source type has a specific threading
strategy.

## Scope Definitions

```kotlin
// BLE: single-thread — sequential access required by BT adapter
single<CoroutineScope>(named<DataSourceType.Ble>()) {
    CoroutineScope(Dispatchers.IO.limitedParallelism(1) + SupervisorJob())
}

// Network: parallel — concurrent HTTP requests OK
single<CoroutineScope>(named<DataSourceType.Network>()) {
    CoroutineScope(Dispatchers.IO + SupervisorJob())
}

// SQL: single-thread — avoid concurrent DB writes
single<CoroutineScope>(named<DataSourceType.Sql>()) {
    CoroutineScope(Dispatchers.IO.limitedParallelism(1) + SupervisorJob())
}
```

## Rules

- Always use the correct named scope for the data source type
- BLE scope is single-threaded: concurrent BLE operations cause
  adapter conflicts/crashes
- SQL scope is single-threaded: prevents concurrent write conflicts
- Network scope is parallel: safe for concurrent HTTP calls
- All scopes use `SupervisorJob()` so child failures don't cancel
  siblings

## DI Registration Conventions

Prefer auto-wiring (`factoryOf`/`singleOf`) over manual `get()` calls.
Manual wiring requires updating the registration every time the
constructor changes — auto-wiring handles it automatically.

```kotlin
// Preferred — auto-wired, no maintenance needed
factoryOf(::MyUseCase)
singleOf(::MyRepository)

// Only when manual wiring is required
factory { MyHandler(get(), get(named<DataSourceType.Ble>())) }
```

### When to use manual wiring

Use `factory { }` / `single { }` with explicit `get()` only when:
- A dependency needs a **named qualifier**: `get(named<DataSourceType.Ble>())`
- A dependency comes from **factory params**: `params.get()`
- A dependency needs a **specific generic type**: `get<MutableStateFlow<T>>()`

### Lifecycle rules

- `factoryOf` for use cases, interactors, screen models (new per injection)
- `singleOf` for repositories, storage, and shared state (singleton)
- Screen models with navigation params use `factory { params -> }` since
  `factoryOf` cannot forward Koin parameters
