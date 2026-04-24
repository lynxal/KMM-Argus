# Standards for `:argus-android`

The following standards apply to this work, collected from `agent-os/standards/index.yml`.

---

## kmp/module-boundaries

**Why this applies:** `:argus-android` depends one-way on `:argus-server-core` and `:argus-core`; nothing above it may depend back. The module sits in the top layer of the Argus graph, analogous to how `shared` sits above `common` / `analytics` in the table below.

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

*(For Argus: `:argus-core` plays the `common` role; `:argus-server-core` and `:argus-webui-bundle` sit above it; `:argus-android` sits above `:argus-server-core` and is analogous to a platform adapter (`lynxmesh_*`).)*

---

## kmp/module-build-conventions

**Why this applies:** The module uses the standard Argus KMP build shape: `kotlinMultiplatform` + `androidLibrary` plugins, version catalog, JVM 17 toolchain, `-opt-in=kotlin.time.ExperimentalTime`. Only deviation is the single `androidTarget()` (no JVM, no iOS) — Android-only by design.

# Module Build Conventions

## Plugin Assignment Convention

- `compose` + `compose.compiler` — any module with `@Composable` code
- `serialization` — modules with `@Serializable` data classes
- `buildkonfig` — only `shared` (single source of environment config)
- `sqlDelight` — only `shared` and `lynxmesh_sqldelight`
- `moko.resources` — modules that define strings, images, or fonts
- `google.services` / `firebase.*` — only `androidApp`

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

## SDK Versions (gradle.properties)

- `android.compileSdk` = 36, `android.targetSdk` = 36, `android.minSdk` = 24
- `jvm.version` = 17

*(For `:argus-android`: neither `compose` nor `serialization` is needed — the module has no `@Composable` code and no `@Serializable` types of its own. The `-opt-in=kotlin.time.ExperimentalTime` compiler flag still applies.)*

---

## naming/package-structure

**Why this applies:** Every new file lands under `com.lynxal.argus.android` in a flat layout; one top-level declaration per file; no subpackages needed at this size. Matches the repo's package convention.

# Package Structure

## Folder Naming

Use **singular** names for all packages.

- camelCase for multi-word folders: `useCase/`, `remoteState/`
- No abbreviations in folder names

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

*(For `:argus-android`: the module is small enough that the root `com.lynxal.argus.android` package holds all facade classes directly — no data/domain/remote/ui split is warranted. `Argus.kt`, `ArgusHandle.kt`, `ArgusConfigBuilder.kt`, `AppInfoBuilder.kt`, `LocalIp.kt` are each their own file.)*

---

## platform/init-and-di

**Why this applies:** Host Android apps initialize Argus from `Application.onCreate()` — the Android half of the init convention. The sample's `SampleApp.onCreate()` already follows this pattern today.

# Platform Init & DI

## Initialization Flow

### Android
Auto-initialized via `Application.onCreate()`:

```kotlin
class App : Application(), AppInfo {
    override fun onCreate() {
        startKoin {
            androidLogger(Level.ERROR)
            androidContext(this@App)
            modules(appModule, sharedAppModule(...), networkModule, domainModules)
        }
    }
}
```

*(For `:argus-android`: no Koin involved — this module exposes a plain `object Argus` singleton that the host `Application.onCreate()` calls `.start(this)` on. The sample's `SampleApp.onCreate()` constructs `DebugToolsImpl(this)`, which in turn calls `Argus.start(app)`. Release-variant `DebugToolsImpl` does nothing argus-related, preserving the zero-argus invariant.)*

---

## validation/logging-conventions

**Why this applies:** App-level logs (HTTP events captured by the Ktor plugin, application logs forwarded by `ArgusLoggerDelegate`) flow through KMMLogging's `Logger`. The one exception is the single startup line printed on server bind, which predates `Logger.add(...)` in the sample's init ordering.

# Logging Conventions

## Two Logging Systems

**`Logger`** — for application-level code (`shared`, `ui_components`, etc.):
```kotlin
Logger.tag("Zone state").debug("Starting retrieval for zone $zoneId")
Logger.error("Operation failed", throwable)
```

## Logger Tag Convention

Tags describe the **feature/domain area**, not the class name:

```kotlin
// Good
Logger.tag("Zone state").debug("Retrieval complete")
Logger.tag("Hub connection").debug("State: $state")

// Avoid
Logger.tag("ZoneStateRetrievalUseCaseImpl").debug("...")
```

## Log Levels

- **error** — Failures requiring attention. Always include throwable if available
- **debug** — State changes, operation progress, useful for development
- **verbose** — High-volume data (HTTP bodies, raw BLE data)

*(For `:argus-android`: the single `Argus listening on …` line at server-bind time uses `android.util.Log.i("Argus", …)` because `Argus.start()` executes before `installLogging()` wires `Logger` delegates in the sample's flow. All other logging — HTTP captures, forwarded `Logger` calls — goes through the KMMLogging path unchanged.)*

---

## workflow/commit-conventions

**Why this applies:** Commits from this work must use the repo's `feat:` prefix, imperative mood, ≤72 char subject, and **no AI attribution trailer** (also recorded as user memory).

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
