# Standards for `:argus-server-core`

The following standards apply to this work, collected from `agent-os/standards/index.yml`.

---

## kmp/module-boundaries

**Why this applies:** `:argus-server-core` depends one-way on `:argus-core` and `:argus-webui-bundle`; nothing above it may depend back. Matches Argus's strict module-graph shape in `agent-os/product/tech-stack.md` lines 28-37.

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

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies
- **`common` has zero internal module dependencies** — it's the foundation

*(For Argus: `:argus-core` plays the `common` role; `:argus-server-core` sits above it alongside `:argus-webui-bundle`.)*

---

## kmp/expect-actual-conventions

**Why this applies:** `ArgusServer` is `expect class` in commonMain with actuals in `jvmAndAndroidMain` and `iosMain`. The `ArgusConfig` constructor pattern (platform-specific nothing but engine differs) matches the "platform-specific constructor params or deps" row of the `expect` form table.

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

## Rules

- Keep expect declarations minimal — push shared logic to commonMain functions that call the expect
- Prefer `expect fun` over `expect class` when no platform-specific state is needed
- All expect declarations must have actuals for both Android and iOS — no partial implementations

*(This spec's single-file-per-source-set layout — `jvmAndAndroidMain/ArgusServer.kt` + `iosMain/ArgusServer.kt` rather than `.android.kt` / `.ios.kt` — follows the precedent set by `argus-webui-bundle/src/jvmAndAndroidMain/...`.)*

---

## kmp/module-build-conventions

**Why this applies:** Kotlin 2.2.0, Gradle KTS, version catalog, JVM 17, iOS static frameworks, `compileSdk` from catalog.

# Module Build Conventions

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

## Version Catalog

All dependency versions in `gradle/libs.versions.toml`. Root `build.gradle.kts` declares all
plugins with `apply false` for consistent versioning.

Access in modules: `libs.plugins.multiplatform`, `libs.ktor.client.core`, etc.

## Compiler Options

All modules apply:

```kotlin
compilerOptions {
    freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
}
```

---

## naming/package-structure

**Why this applies:** Package root `com.lynxal.argus.server`; subpackages `buffer`, `bus`, `protocol`, `filter`, `routes`. One top-level declaration per file.

# Package Structure

## Folder Naming

Use **singular** names for all packages.

- camelCase for multi-word folders: `useCase/`, `remoteState/`
- No abbreviations in folder names

## File Organization

One top-level class, interface, or enum per file. The file name must match the class name.

Exceptions: private helpers or tightly coupled sealed subtypes defined inside the same sealed parent are fine.

---

## testing/test-structure

**Why this applies:** `kotlin.test` with `runTest`, backtick names, AAA. `commonTest` for target-agnostic tests; `jvmTest` for Ktor `testApplication` (JVM-only).

# Test Structure & Naming

## Framework

Use `kotlin.test` for all tests. Multiplatform-compatible, runs on JVM, Android, and iOS.

```kotlin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.BeforeTest
```

For suspend/coroutine tests, use `kotlinx.coroutines.test.runTest`.

## Test Placement

- **`commonTest`** — default for all tests (runs cross-platform)
- **`androidUnitTest` / `iosTest`** — only for platform-specific implementations (expect/actual, Android Context, iOS frameworks)

## Naming

Backtick names preferred for readability. Describe behavior, not implementation.

## Structure (AAA)

Arrange-Act-Assert.

## Test Class Naming

Suffix with `Test`: `EventRingBufferTest`, `EventFilterTest`.

---

## testing/test-data-factories

**Why this applies:** Reuse `createTestHttpEvent()`, `createTestLogEvent()` from `:argus-core`; add `createTestAppInfo()`, `createTestArgusConfig()`, `createTestEventFilter()` in a local `ServerTestFactories.kt`.

# Test Data Factories

Use factory functions with default parameters instead of builders or raw constructors.

## Factory Function Pattern

```kotlin
fun createDummySpaceData(
    id: Long = 0,
    name: String = "DummyZone",
    ...
) = SpaceData(...)
```

- Prefix with `createDummy` or `createTest`
- All parameters have sensible defaults
- Tests override only the fields they care about

## Factory Location

- **Module-specific factories** for module-internal entities
- **Shared factories** for cross-module entities

---

## coroutines/suspend-vs-flow

**Why this applies:** `start()`/`stop()` are one-shot operations (suspend). Event fan-out uses `Channel` per subscriber (not `SharedFlow`) to avoid silent drop under load. `Dispatchers.Default.limitedParallelism(1)` enforces single-writer serialization on the ring buffer's mutation.

# Suspend vs Flow

## When to Use Each

**`suspend fun`** — one-shot operations:
- Fetch, save, calculate, send command

**`Flow<T>`** — reactive state/status observation:
- Connection state, device updates, UI state streams

## CoroutineScope Injection

Inject a custom `CoroutineScope` via DI only when required:

- **Single-threaded execution:** `Dispatchers.IO.limitedParallelism(1)` for serialized DB/mesh access
- **Outliving UI lifecycle:** any long-running operation that must not cancel when the app is minimized
- **Specific dispatcher:** Operations needing Main thread for state updates

---

## coroutines/job-lifecycle

**Why this applies:** `ArgusServer.stop()` must cancel the engine and the buffer actor before restart would be safe. A supervised scope on the buffer prevents one subscriber's failure from killing the actor.

# Job Lifecycle

## Cancel Before Restart

Always cancel the previous job before launching a replacement.

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

---

## workflow/commit-conventions

**Why this applies:** This spec's implementation ships as `feat: add :argus-server-core embedded Ktor server + ring buffer`. Per user auto-memory, no `Co-Authored-By` Claude trailer.

# Commit Conventions

## Commit Message Format

```
<type>: <subject> [optional (#issue)]

[optional body]
```

### Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body (optional): explain **why**, not **what**. Wrap at 72 characters.
- Reference GitHub issues when applicable: `(#123)`.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any
  trailer that identifies an AI agent.

### Staging

- Stage files explicitly by name — avoid `git add -A` or `git add .`.
- Never stage secrets.
- Do not mix unrelated changes in a single commit.
