# Standards for Argus Logging Delegate

The following standards apply to this work. Full content inlined below.

---

## kmp/module-boundaries

# Module Boundaries

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies
- **Base modules have zero internal module dependencies** — they're the foundation
- Argus: `:argus-core` is the base; no internal deps. `:argus-server-core` depends on `:argus-core`. Platform modules (`:argus-android`, `:argus-ios`) depend on `:argus-server-core`.

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

## naming/code-documentation

# Code Documentation

## When to Document

| What | Required | Example |
|------|----------|---------|
| Public/internal API functions | Yes | Repository methods, use case `execute()`, interface methods |
| Non-trivial business logic | Yes | Address resolution, optimistic updates, retry algorithms |
| Classes and interfaces | Yes | KDoc on class declaration explaining purpose and collaborators |
| Simple getters/setters/delegates | No | `fun getCachedNode(id)` that just delegates to storage |
| Private helpers with clear names | No | Unless the logic is surprising |

## Format

Use KDoc (`/** */`) for public API. Use inline comments (`//`) for
non-trivial logic within function bodies.

### Class-level KDoc

```kotlin
/**
 * Orchestrates group-then-retry state retrieval over BLE mesh.
 *
 * Sends a single group command, waits for responses, then retries
 * only missed devices individually — minimizing BLE traffic.
 *
 * @see StateRetrievalDelegate for the per-operation strategy
 */
class GroupStateRetrievalUseCase(...)
```

### Function-level KDoc

```kotlin
/**
 * Refresh light state for all luminaries in the home.
 *
 * Sends a GetAll command to the home group address (0xC0EF).
 * Responses are processed asynchronously by [MeshNetworkStateProcessingDelegate]
 * and stored in [NodeStorage]. This is a blocking call — it waits for
 * all devices to respond or retries to complete.
 */
suspend fun refreshHomeState(): Result<Unit>
```

### Inline comments for business logic

```kotlin
// Element address = node unicast address + channel offset within the node.
// For example, a node at 0x0010 with lightness on channel 1 → address 0x0011.
val address = node.structure.address.toInt() + channelEntry.key
```

## Rules

- Document the **why**, not the **what**
- Include `@see` references to collaborating classes when the interaction is not obvious
- For formulas or magic numbers, explain the derivation
- Add examples in comments when the mapping is non-trivial
- Keep comments up to date — stale comments are worse than no comments
- Do not add comments to code you did not write or change

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
- **`androidUnitTest` / `iosTest`** — only for platform-specific implementations

Mirror the source package structure in test directories.

## Naming

**Backtick names preferred** for readability:

```kotlin
@Test
fun `encodedId correctly encodes familyId, seriesId, and deviceId`() { }
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

Use `@BeforeTest` for shared initialization.

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
- Tests override only the fields they care about

## Factory Location

- **Module-specific factories** for module-internal entities
- **Shared factories** for cross-module entities in a shared test util

## Private Helpers

For test-local data, use private helpers in the test class.
