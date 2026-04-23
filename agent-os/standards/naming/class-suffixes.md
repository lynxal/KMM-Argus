# Class Suffixes

Every class suffix signals its role in the architecture.

## Data Layer

| Suffix | Role | Example |
|--------|------|--------|
| `Storage` | Local data holder (in-memory or disk). Owns reactive state. | `UserStorage`, `SpaceStorage` |
| `Repository` | Orchestrates across sources (storage, remote, mesh). Never holds state directly. | `StateRepository`, `ZonesRepository` |

- Storage = local state owner, Repository = multi-source orchestrator
- A Repository may depend on multiple Storage + Service instances
- A Storage never depends on a Repository or Service

## Remote Layer

| Suffix | Role | Example |
|--------|------|--------|
| `Service` | Remote API communication (HTTP/WebSocket). Interface + `Impl`. | `AccountService`, `SceneService` |

- Services live in `remote/services/`
- Always interface + `Impl` pair
- Companion object holds URL constants

## Domain Layer

| Suffix | Role | Example |
|--------|------|--------|
| `UseCase` | Single business operation. Method: `execute()`. | `GetBuildingsUseCase` |
| `Delegate` | Pluggable strategy for composable behavior. | `ZoneStateRetrievalDelegate` |
| `Handler` | Processes user/device input events. | `BrightnessSliderInputHandler` |

- UseCase = what to do, Delegate = how to do a sub-step, Handler = input processing
- UseCases return `Result<T>`
- Handlers own a CoroutineScope for debouncing/throttling

## UI Layer

| Suffix | Role | Example |
|--------|------|--------|
| `Screen` | Composable page (Voyager Screen). | `SignInScreenN3` |
| `ScreenModel` | State + logic for a Screen (Voyager ScreenModel). | `HomeScreenModel` |
| `ViewContract` | UI contract interface binding state to actions. | `HomeViewContract` |

- `N3` suffix = Compose Navigation v3 migration

## Implementation Naming

| Pattern | When |
|---------|------|
| `FooImpl` | Default/only implementation of `Foo` interface |
| `FooInterface` | Base contract with minimal operations (e.g. `reset()`) |
| `FooV3` / `FooV3Impl` | Versioned replacement (keep old until migration complete) |
