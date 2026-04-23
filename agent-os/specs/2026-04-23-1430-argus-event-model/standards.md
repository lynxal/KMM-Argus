# Standards for Argus Event Model

The following standards apply to this work. Full content inlined below.

---

## domain-modeling/sealed-hierarchies

# Sealed Hierarchies

## sealed interface vs sealed class

- `sealed interface` — subtypes have no shared properties
- `sealed class` — subtypes share common fields via constructor

Default to `sealed interface`. Use `sealed class` only when shared state is needed.

## Operation Result States

Model operation outcomes as sealed interfaces with nested variants:

```kotlin
sealed interface LoginState {
    data object Success : LoginState
    sealed class Error(message: String) : LoginState, Throwable(message) {
        data class ServerError(val code: Int, override val message: String) : Error(message)
        data class CredentialError(val errors: Map<String, List<String>>, override val message: String) : Error(message)
        data class TimeoutError(override val message: String) : Error(message)
    }
}
```

**Rules:**
- Top level: `sealed interface` (Success has no shared fields with Error)
- Error family: `sealed class` extending both the state type AND `Throwable`
- Dual-purpose: errors work in `when` exhaustive matching AND can be thrown/caught
- Specific errors: `data class` with context-specific fields
- Success with no data: `data object`

## Device/Entity Type Hierarchies

For modeling product families with deep nesting:

```kotlin
sealed interface MeshDeviceDescriptor {
    val defaultName: String
    val numChannels: Int
    companion object {}

    data object UnknownDevice : MeshDeviceDescriptor { ... }

    open class CanvasDevice(...) : MeshDeviceDescriptor {
        open class LVPM(...) : CanvasDevice(...) {
            data object Small1ChBrightness : LVPM(...)
        }
    }
}
```

- Leaf types: `data object` (singleton) or `data class` (parameterized)
- Branch types: `open class` with constructor defaults
- Unknown/fallback: always provide a `data object UnknownX` variant

## Variant Naming

- `data object` for singletons: `Success`, `Loading`, `UnknownDevice`
- `data class` for variants with context: `ServerError(code, message)`
- Name variants by what they represent, not by type: `CredentialError` not `ErrorType2`

---

## naming/entity-dto-naming

# Entity & DTO Naming

## Domain Entities

Plain descriptive names — no prefix or suffix:

```kotlin
data class UserProfile(...)
data class SpaceData(...)
data class SceneData(...)
```

- `Data` suffix for aggregate domain objects: `SpaceData`, `SceneData`
- No `Entity` or `Model` suffix

## State Objects

Source-based prefixes indicate where the data comes from:

| Prefix | Meaning | Example |
|--------|---------|--------|
| `Remote` | Raw cloud/API state | `RemoteNodeState`, `RemoteZoneState` |
| `Mesh` | Raw BLE mesh state | `MeshNodeState`, `MeshZoneState` |
| `Composite` | Wrapper with `structure` + `state` fields | `CompositeNodeState`, `CompositeSpaceState` |

- **`Combined*` is deprecated** — do not use
- **Flattened `Composite*` is deprecated** — only use the `structure` + `state` wrapper form
- See `domain-modeling/state-composition` for the Composite wrapper pattern
- State suffix always present: `*State`

## Sealed State Hierarchies

For operation outcomes, use sealed interfaces:

```kotlin
sealed interface HttpResponseState {
    data object Success : HttpResponseState
    data class ServerError(val message: String) : HttpResponseState
    data class ClientError(val message: String) : HttpResponseState
}
```

- Name after the operation or context: `CreateAccountState`, `LoginState`
- Variants as nested classes/objects

## Request/Response DTOs

Strict `Request`/`Response` suffixes — no `Dto` or `Params`:

```kotlin
@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class LoginResponse(
    val id: Long,
    @SerialName("access_token")
    val accessToken: String
)
```

- Placed in `domain/entity/remote/request/` and `domain/entity/remote/response/`
- Always `@Serializable`
- Use `@SerialName` for snake_case JSON mapping

## View Objects & Descriptors

| Suffix | Use | Example |
|--------|-----|--------|
| `Descriptor` | Sealed hierarchy describing device/UI variants | `MeshDeviceDescriptor` |
| `Content` | UI-ready data container for a screen | `HomeViewContent` |
| `ViewAction` | Sealed class of user actions | `HomeViewModelAction` |

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

## kmp/module-build-conventions

# Module Build Conventions

## Plugin Assignment Convention

- `compose` + `compose.compiler` — any module with `@Composable` code
- `serialization` — modules with `@Serializable` data classes
- `buildkonfig` — only `shared` (single source of environment config)
- `sqlDelight` — only `shared` and `lynxmesh_sqldelight`
- `moko.resources` — modules that define strings, images, or fonts
- `google.services` / `firebase.*` — only `androidApp`

## iOS Framework Configuration

```kotlin
val useStaticFramework = findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true

listOf(iosArm64(), iosSimulatorArm64()).forEach {
    it.binaries.framework {
        baseName = "moduleName"
        isStatic = useStaticFramework
    }
}
```

Default: static frameworks. Toggle via `-PuseStaticFramework=false`.

Each module's framework `baseName` matches the module name.

## Version Catalog

All dependency versions in `gradle/libs.versions.toml`. Root `build.gradle.kts` declares all plugins with `apply false` for consistent versioning.

Access in modules: `libs.plugins.multiplatform`, `libs.ktor.client.core`, etc.

## Compiler Options

All modules apply:

```kotlin
compilerOptions {
    freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
}
```

## SDK Versions (gradle.properties)

- `android.compileSdk` = 36, `android.targetSdk` = 36, `android.minSdk` = 26 (Argus diverges: 24)
- `jvm.version` = 17
- Gradle JVM args: `-Xmx8192M`, max workers: 16

---

## kmp/module-boundaries

# Module Boundaries

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies
- **Base modules have zero internal module dependencies** — they're the foundation
- Argus: `:argus-core` is the base; no internal deps. `:argus-server-core` depends on `:argus-core`. Platform modules (`:argus-android`, `:argus-ios`) depend on `:argus-server-core`.

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

---

## validation/no-internal-apis

# No Internal API Usage

Never use annotations, classes, or functions from `kotlin.internal.*` or any other internal/unstable API packages.

## Prohibited Packages

- `kotlin.internal.*`
- `kotlin.jvm.internal.*`
- `kotlinx.coroutines.internal.*`
- `androidx.compose.runtime.internal.*`
- Any package containing `.internal.` in its path that is not explicitly documented as public API

## Rules

- Do not import from internal packages, even if the IDE autocompletes them
- Do not suppress warnings to allow internal API access (`@Suppress("INVISIBLE_MEMBER", "INVISIBLE_REFERENCE")`)
- If a public API does not exist for the desired behavior, implement it manually or find a supported library alternative
- Treat compiler warnings about internal API usage as errors — fix them immediately

## Why

Internal APIs bypass the Kotlin binary compatibility guarantees. Code that depends on them may:
- Fail to compile after a Kotlin version bump
- Produce incorrect bytecode silently
- Break on specific platforms (especially Kotlin/Native and Kotlin/JS where internals differ)

---

## cloud/request-response-modeling

# Request/Response Modeling

All API models use `kotlinx.serialization` with `@Serializable`.

## Serialization Rules

- Use `@SerialName` to map snake_case/PascalCase API fields to camelCase Kotlin properties
- All fields nullable with defaults where the API may omit them
- Use `data class` for all request/response models

```kotlin
@Serializable
data class NewDeviceRequest(
    val name: String,
    val uuid: String,
    @SerialName("spaceId")
    val spaceId: Long?,
    val illustrationId: String = "default"
)
```

> Cited here for the `@Serializable` + `@SerialName` + default-value idiom. Argus events are wire DTOs that happen not to be cloud request/response bodies, but the kotlinx.serialization patterns are identical.
