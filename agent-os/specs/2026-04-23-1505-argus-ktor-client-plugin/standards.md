# Standards — Argus Ktor Client Plugin

The following standards apply to this work. Contents are inlined verbatim
from `agent-os/standards/` at the time of shaping.

---

## kmp/module-boundaries

# Module Boundaries

## Module Hierarchy (dependencies flow downward only)

```
shared (app layer: screens, use cases, DI, repositories)
├── common_ui (theme, shared UI domain)
│   └── common
├── ui_components / ui_components_v2 (reusable Compose components)
│   ├── common
│   ├── common_ui
│   └── analytics
├── lynxmesh (Bluetooth Mesh protocol: crypto, transport, messages)
│   └── common
├── lynxmesh_sqldelight (SQLDelight database for mesh data)
├── lynxmesh_kable (BLE communication via Kable library)
│   └── common
├── lynxmesh_localstorage (key-value storage abstraction)
├── common (core types, utilities, shared entities)
└── analytics (analytics abstraction)
```

## What Goes Where

| Module | Contains | Does NOT contain |
|--------|----------|-----------------|
| `common` | Core types, utilities, base entities, `MultiplatformSerializable` | Business logic, UI, platform SDKs |
| `lynxmesh` | Mesh protocol, crypto, transport, message hierarchy | App-level logic, UI, storage |
| `lynxmesh_*` | Isolated platform adapters (SQL, BLE, local storage) | Mesh protocol logic |
| `common_ui` | Theme, colors, shared UI domain entities | Screens, navigation |
| `ui_components` | Reusable Compose components, design system | Business logic, screen-level state |
| `shared` | Screens, use cases, repositories, DI, navigation | Nothing — top-level module |
| `analytics` | Analytics interface and events | Platform SDK implementations (those go in androidMain/iosMain) |

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies (e.g., `lynxmesh_localstorage` keeps `SharedPreferences`/`NSUserDefaults` out of `lynxmesh`)
- **`common` has zero internal module dependencies** — it's the foundation
- **New reusable UI → `ui_components`**; new screens → `shared/ui/screen/`

---

## kmp/expect-actual-conventions

# Expect/Actual Conventions

## File Naming

- Common declaration: `ClassName.kt` in `commonMain/`
- Platform actuals: `ClassName.android.kt`, `ClassName.ios.kt`
- Per-architecture (cinterop): use `iosArm64Main/`, `iosSimulatorArm64Main/`

## Which Form to Use

| Form | When | Example |
|------|------|---------|
| `expect class` | Platform-specific constructor params or deps | `GetCountryCodeUseCase(context)` vs `GetCountryCodeUseCase()` |
| `expect object` | Stateless singleton with platform impl | `CryptoUtils` (BouncyCastle vs SwiftCryptoBackend) |
| `expect fun` | Standalone function, esp. `@Composable` | `PlatformSpecificAppTheme()`, `stringResource()` |
| `expect val` | Platform-specific singleton or constant | `appInfo`, `appModule` |
| `expect interface` | Marker interface differing per platform | `MultiplatformSerializable` |

## Platform Stubs

- Stubs (e.g. `return true`) are acceptable when the functionality is irrelevant on that platform
- Mark intentional stubs with a comment: `// Not needed on iOS`
- Stubs that represent missing functionality are tech debt — add a `// TODO` comment

## Source Set Structure

```
module/src/
  commonMain/    → expect declarations + shared logic
  androidMain/   → actual implementations (Android SDK)
  iosMain/       → actual implementations (Foundation/UIKit)
  iosArm64Main/  → device-specific (cinterop .def files)
  iosSimulatorArm64Main/ → simulator-specific (cinterop .def files)
  nativeMain/    → shared across iOS targets only
```

## Rules

- Keep expect declarations minimal — push shared logic to commonMain functions that call the expect
- Prefer `expect fun` over `expect class` when no platform-specific state is needed
- All expect declarations must have actuals for both Android and iOS — no partial implementations

---

## cloud/http-error-handling

# HTTP Result & Error Handling

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

All remote calls return `Result<T>` via `HttpClientWrapper`. Never throw from services.

## HttpClientWrapper Methods

```kotlin
client.executeSafeGet<T> { ... }    // GET
client.executeSafePost<T> { ... }   // POST
client.executeSafePut<T> { ... }    // PUT
client.executeSafeDelete<T> { ... } // DELETE
client.executeSafePatch<T> { ... }  // PATCH
```

All run on the wrapper's `coroutineScope` context. All return `Result<T>`.

## Error Parsing Chain

On non-2xx responses, errors are parsed in order:

1. **`HttpErrorResponse`** — business errors (`{ errorCode, errorMessage }`)
2. **`HttpValidationErrorResponse`** — validation errors (`{ status, type, title, errors }`)
3. **Fallback** — generic from HTTP status code and description

Each level catches `JsonConvertException` / `NoTransformationFoundException` before falling to the next. The `httpErrorCode` field is always set from the actual HTTP status.

## Error Response Classes

Both extend `RuntimeException` AND are `@Serializable` — dual-purpose for Result.failure() and throw contexts:

```kotlin
@Serializable
data class HttpErrorResponse(
    val errorCode: Int,
    val errorMessage: String,
    val httpErrorCode: Int = 0
) : RuntimeException("HTTP Error[$errorCode]: $errorMessage")

@Serializable
data class HttpValidationErrorResponse(
    val status: Int,
    val type: String = "",
    val title: String = "",
    val traceId: String = "",
    val errors: Map<String, List<String>> = emptyMap(),
    val httpErrorCode: Int = 0
) : RuntimeException("HTTP Error[$status] / $type: $title")
```

## Rules

- Never throw from service methods — always return `Result<T>`
- Check `result.isSuccess` / use `onSuccess`/`onFailure` at call sites
- Network exceptions (timeout, connectivity) are caught and wrapped in `Result.failure()`
- Two error shapes exist because the API returns different formats for business errors vs validation errors (legacy API)
- `httpErrorCode` carries the raw HTTP status for downstream classification (4xx vs 5xx)

---

## security/auth-flow

# Auth Flow & Bearer Refresh

## Dual HTTP Clients

Two named clients registered in Koin:
- `AuthorizedHttpClient` — Ktor Auth plugin installed, automatic bearer token refresh
- `UnauthorizedHttpClient` — No Auth plugin, used for login/signup/refresh endpoints

Never mix them. Authenticated endpoints must use `AuthorizedHttpClient`.

## Bearer Token Refresh

Ktor Auth plugin handles 401 responses automatically:
```kotlin
install(Auth) {
    bearer {
        loadTokens { BearerTokens(tokenRepo.getAccessToken(), tokenRepo.getRefreshToken()) }
        refreshTokens { get<RefreshAccessTokenUseCase>().execute() }
    }
}
```

`RefreshAccessTokenUseCase.execute()` always returns `BearerTokens` — Ktor's `refreshTokens` callback requires it. On refresh failure with 4xx, triggers `logoutUseCase.execute()`.

## Manual Token Refresh Trigger

`RequestAccessTokenRefreshUseCase` forces a refresh cycle:
1. `tokenRepository.invalidateAccessToken()` (overwrite with "invalid")
2. `httpClient.invalidateBearerTokens()` (clears Ktor's internal cache)
3. Next HTTP request triggers automatic refresh via Auth plugin

## Conditional Retries

Retries gated on token availability — prevents retry loops on expired credentials:
```kotlin
val tokenAvailable = get<TokenStorage>().hasRefreshToken.value ?: false
retryIf(maxRetries = 3) { _, response ->
    response.status.value in 500..599 && tokenAvailable
}
```
Exponential delay: base 1.5, max 10s, randomization 100ms.

## Common Mistakes

- Wrong request/response DTO for the endpoint
- Missing `@Serializable` annotation on new DTOs
- All service request/response classes must be annotated with `@Serializable`

---

## security/login-session

# Login & Session Management

## LoginState Sealed Hierarchy

```kotlin
sealed interface LoginState {
    object Success : LoginState
    sealed class Error(message: String) : LoginState, Throwable(message) { ... }
}
```

Error subtypes: `ServerError`, `EmailVerificationError`, `CredentialError`, `UnknownError`, `TimeoutError`.

Dual inheritance is intentional:
- `Throwable` — propagates through `Result.failure()` chains
- `sealed` — exhaustive `when` matching in UI code

`CredentialError` carries field-level validation: `errors: Map<String, List<String>>`.

## Login Flow

1. `LoginUseCase.execute(userName, password)` calls `UnauthorizedAccountService.login()`
2. On success: `clearStoredDataUseCase.execute()` then `tokenRepository.storeTokens()`
3. On failure: HTTP error mapped to `LoginState.Error` subtype via `HttpResponseState.Error.fromThrowable()`

## Session Storage

- `SessionStorage` tracks selected building, mesh UUID, sync dates
- `selectedBuildingIdFlow: SharedFlow<Long>` with replay=1 for latest-value caching
- Buildings persisted in SQLDelight; mesh data in LocalStorage

## Logout & Data Cleanup

Multi-stage logout via `LogoutUseCase`:
1. `ClearStoredDataUseCase` — clears all user-scoped storages
2. `TokenStorage.clearAll()` — wipes encrypted tokens
3. `httpClient.invalidateBearerTokens()` — clears Ktor's internal cache
4. `Analytics.resetAnalytics()` — resets user identity

**Rule:** Every new user-scoped storage must be added to `ClearStoredDataUseCase`. App-level config storages are excluded.

## Firebase AppCheck

All unauthenticated auth endpoints require `X-Firebase-AppCheck` header:
```kotlin
header("X-Firebase-AppCheck", apCheckProvider.getAppCheckToken())
```
Android uses Firebase AppCheck SDK. Token cached with expiry tracking. Falls back to `"INVALID"` on error.

## Auth Request Format

- Login and refresh use form-encoded bodies (`ContentType.Application.FormUrlEncoded`)
- `LoginRequest.urlEncodedRequestBody` / `RefreshRequest.urlEncodedRequestBody` (lazy)
- Refresh includes conditional `Building-Id` header for multi-tenant context

---

## security/token-lifecycle

# Token Lifecycle

All tokens stored in KVault (encrypted). No exceptions — never keep tokens in memory only.

## Storage Layer

- `TokenStorage` interface + `TokenStorageImpl(KVault, CoroutineScope)`
- `TokenRepository` facades TokenStorage, exposes `isSignedIn: StateFlow<Boolean?>`
- All operations wrapped in `withContext(coroutineScope.coroutineContext)`

## State Observability

- `isSignedIn: StateFlow<Boolean?>` — null = not yet checked, true/false = resolved
- `hasRefreshToken: StateFlow<Boolean?>` — same tri-state semantics
- Updated via `updateTokenStates()` after every write

## Invalidation Strategy

Overwrite with `"invalid"` string — never delete the key:
```kotlin
encryptedStorage.set(ACCESS_TOKEN_KEY, "invalid")
```
Preserves key existence to distinguish "invalidated" from "never stored" (null).

## Defensive Defaults

- `getAccessToken()` / `getRefreshToken()` return empty string on error
- Catch `RuntimeException`, log, never throw from storage reads
- `clearAll()` sets both StateFlows to `false` after `encryptedStorage.clear()`

## Storage Keys

- `ACCESS_TOKEN_KEY = "accessToken"`
- `REFRESH_TOKEN_KEY = "refreshToken"`

---

## coroutines/job-lifecycle

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

---

## coroutines/flow-composition

# Flow Composition

## Multi-Source Aggregation

Use `combine()` + `collectLatest()` to merge independent state sources:

```kotlin
combine(
    repoA.stateFlow,
    repoB.stateFlow,
    repoC.stateFlow
) { a, b, c ->
    Triple(a, b, c)
}.collectLatest { (a, b, c) ->
    // Process combined state
}
```

- `Pair` for 2 sources, `Triple` for 3
- For 4+ sources, use a named data class
- `collectLatest()` cancels previous processing when any upstream changes

## ScreenModel stateIn Convention

All ScreenModel view states use `WhileSubscribed(5000)`:

```kotlin
val viewState = _viewState.onStart {
    initStates()
}.stateIn(
    viewModelScope,
    SharingStarted.WhileSubscribed(5000),
    InitialUiState()
)
```

- **5-second timeout** survives orientation changes but frees resources after navigation
- `onStart {}` triggers initialization side effects (data loading)
- Initial value is the idle/loading UI state

## Init Block Collectors

ScreenModels collect repository flows in `init {}`:

```kotlin
init {
    viewModelScope.launch {
        repository.connectionState.collectLatest { state ->
            // Update UI state
        }
    }
}
```

Each independent data source gets its own `launch` block.

---

## testing/mocking-conventions

# Mocking with Mokkery

Use [Mokkery](https://mokkery.dev) for mocking dependencies in tests.

## Mock Creation

Initialize mocks in `@BeforeTest` with inline configuration:

```kotlin
private lateinit var repository: MeshProxyCommunicationRepository

@BeforeTest
fun setup() {
    repository = mock {
        every { meshApi } returns mock<BluetoothMeshApi>()
        every { deviceConfigurationStorage } returns mock<DeviceConfigurationStorage>()
    }
}
```

## Stubbing

```kotlin
// Synchronous
every { localStorage.getBoolean(any(), any()) } returns true
every { localStorage.putBoolean(any(), any()) } returns Unit

// Suspend functions
everySuspend { storage.getNodeState(any()) } returns nodeState
```

## Verification

```kotlin
verify { repository.saveState(expectedState) }
```

## Matchers

```kotlin
import dev.mokkery.matcher.any

every { storage.getString(any(), any()) } returns "default"
```

## Mock vs Fake

Choose whichever is simpler for the test:
- **Mokkery mock** — quick setup, good for interface dependencies with few method calls
- **Hand-written fake** — better for complex stateful objects (e.g., in-memory storage implementations)

## Coroutine Tests

Wrap async tests with `runTest`:

```kotlin
@Test
fun `zone state updates correctly`() = runTest {
    // Arrange
    val storage = createStorage()

    // Act
    storage.updateZoneState(testZoneState)

    // Assert
    assertEquals(expected, storage.getZoneState(zoneId))
}
```

---

## testing/test-structure

# Test Structure & Naming

## Framework

Use `kotlin.test` for all tests. It's multiplatform-compatible and runs on JVM, Android, and iOS.

```kotlin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.BeforeTest
```

For suspend/coroutine tests, use `kotlinx.coroutines.test.runTest`.

## Test Placement

- **`commonTest`** — default for all tests (runs cross-platform)
- **`androidUnitTest` / `iosTest`** — only for platform-specific implementations (expect/actual, Android Context, iOS frameworks)

Mirror the source package structure in test directories.

## Naming

**Backtick names preferred** for readability:

```kotlin
@Test
fun `encodedId correctly encodes familyId, seriesId, and deviceId`() {
    // ...
}

@Test
fun `node removed from all spaces should become orphaned`() {
    // ...
}
```

Describe the behavior, not the implementation.

## Structure (AAA)

Follow Arrange-Act-Assert:

```kotlin
@Test
fun `K1 derivation matches spec test vector`() {
    // Arrange
    val input = Bytes.fromHexString("3216d1509884b533...")
    val salt = Bytes.fromHexString("2ba14ffa0df84a28...")

    // Act
    val result = CryptoUtils.calculateK1(input, salt)

    // Assert
    assertEquals(expected, result)
}
```

## Setup

Use `@BeforeTest` for shared initialization:

```kotlin
@BeforeTest
fun setup() {
    repository = mock<SomeRepository> { ... }
    useCase = SomeUseCase(repository)
}
```

## Test Class Naming

Suffix with `Test`: `BytesTest`, `IntValidatorTest`, `MeshDeviceDescriptorTest`.

---

## testing/test-data-factories

# Test Data Factories

Use factory functions with default parameters instead of builders or raw constructors.

## Factory Function Pattern

```kotlin
fun createDummySpaceData(
    id: Long = 0,
    name: String = "DummyZone",
    address: Int = 0,
    parentId: Long? = null,
    devices: List<SpaceDeviceData> = emptyList()
) = SpaceData(
    id = id,
    name = name,
    address = address,
    parentId = parentId,
    devices = devices
)
```

- Prefix with `createDummy` or `createTest`
- All parameters have sensible defaults
- Tests override only the fields they care about:

```kotlin
@Test
fun `orphan node has no space`() {
    val node = createDummyNode(uuid = "test-uuid")
    // All other fields use defaults
}
```

## Factory Location

- **Module-specific factories** for module-internal entities (e.g., mesh entities in `lynxmesh/commonTest/`)
- **Shared factories** for cross-module entities in `shared/commonTest/util/TestDataCreation.kt`

## Spec Test Vectors

For cryptography and BT Mesh protocol tests, use hard-coded test vectors from the specification:

```kotlin
@Test
fun `K1 derivation matches Mesh spec`() {
    // Values from Bluetooth Mesh Profile Specification
    val n = Bytes.fromHexString("3216d1509884b533248541792b877f98")
    val expected = Bytes.fromHexString("f6ed15a8934afbe7d83e8dcb57fcf5d7")
    assertEquals(expected, CryptoUtils.calculateK1(n, salt, p))
}
```

Document the spec section in a comment when using test vectors.

## Private Helpers

For test-local data, use private helpers in the test class:

```kotlin
private fun createTestRemoteZoneState(
    id: Long = 1L,
    nodes: List<RemoteNodeState> = emptyList()
) = RemoteZoneState(id = id, nodes = nodes, ...)
```

---

## naming/class-suffixes

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

---

## naming/package-structure

# Package Structure

## Folder Naming

Use **singular** names for all packages:

```
data/
  repository/      # not repositories/
  storage/
  converter/
domain/
  entity/
  useCase/         # camelCase for multi-word
  service/
remote/
  service/
ui/
  screen/
  model/
  navigation/
utils/               # exception: plural by Kotlin convention
```

- camelCase for multi-word folders: `useCase/`, `remoteState/`
- No abbreviations in folder names

## Nesting Rule

Create a subdirectory at **domain boundaries**:

```
domain/useCase/
  mesh/                    # subdomain: BLE mesh operations
    state/                 # sub-aspect: state setters
    zoneStateRetrieval/    # sub-aspect: zone queries
      delegate/            # pattern: strategy delegates
  remoteState/             # subdomain: cloud state sync
```

- Each distinct subdomain gets its own folder
- Within a subdomain, further split by aspect if the subdomain grows
- Pattern-specific folders (delegate/, command/) go inside their parent feature

## File Organization

One top-level class, interface, or enum per file. The file name must match the class name.

```
// Good
NodeParameter.kt          → data class NodeParameter(...)
NodeParameterResponse.kt  → data class NodeParameterResponse(...)

// Bad — multiple top-level declarations in one file
NodeParameterResponse.kt  → data class NodeParameterGroupResponse(...)
                            data class NodeParameterResponse(...)
```

Exceptions: private helpers or tightly coupled sealed subtypes defined inside the same sealed parent are fine.

## Root Layer Structure

```
com.lynxal.<module>/
  data/          # Storage, repositories, converters
  domain/        # Entities, use cases, services, business logic
  remote/        # HTTP/WebSocket service interfaces and impls
  ui/            # Screens, screen models, navigation
  di/            # Koin module definitions
  utils/         # Shared utilities
```

- `data/` = local state and orchestration
- `remote/` = network communication (separate from data/)
- `domain/` = pure business logic, no platform dependencies

---

## workflow/commit-conventions

# Commit Conventions

## Commit Message Format

```
<type>: <subject> [optional (#issue)]

[optional body]
```

### Types

| Type       | When to use                                    |
|------------|------------------------------------------------|
| `feat`     | New feature or capability                      |
| `fix`      | Bug fix                                        |
| `refactor` | Code restructuring without behavior change     |
| `chore`    | Build, dependency, config, or tooling changes  |
| `docs`     | Documentation only                             |
| `test`     | Adding or updating tests                       |
| `style`    | Formatting, whitespace, import ordering        |
| `perf`     | Performance improvement                        |
| `ci`       | CI/CD pipeline changes                         |
| `build`    | Build system or dependency changes             |

### Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body (optional): explain **why**, not **what**. Wrap at 72 characters.
- Reference GitHub issues when applicable: `(#123)`.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any
  trailer that identifies an AI agent. Commits should be indistinguishable from human-authored
  commits.

### Staging

- Stage files explicitly by name — avoid `git add -A` or `git add .`.
- Never stage secrets (`.env`, credentials, tokens, `google-services.json`).
- Do not mix unrelated changes in a single commit.

### Examples

```
fix: disable controls when device is disconnected (#338)
```

```
refactor: migrate Home screens to koinViewModel for proper scoping

The previous approach leaked ViewModel instances across navigation
destinations because Voyager's navigator-scoped lifecycle was too broad.
```

```
feat: add CCT slider to CanvasControlView (#350)
```
