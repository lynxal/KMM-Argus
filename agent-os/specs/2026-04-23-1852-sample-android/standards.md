# Standards for `:sample-android`

The following standards apply to this work.

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

**Applies here:** `:sample-android` sits at the top of the Argus dependency graph. It depends on `:argus-core` (debug only) and on no higher module — nothing can ever depend on the sample.

---

## kmp/module-build-conventions

# Module Build Conventions

## Module Structure

14 modules in `settings.gradle.kts`:

| Module | Purpose | Key Plugins |
|--------|---------|-------------|
| `androidApp` | Android app entry point | multiplatform, android.application, compose, firebase |
| `shared` | Business logic, DI, screens | multiplatform, serialization, buildkonfig, sqlDelight, moko |
| `common` | Shared utilities | multiplatform, android.library |
| `common_ui` | Shared theme/UI base | multiplatform, compose, moko |
| `analytics` | Analytics abstraction | multiplatform, compose |
| `ui_components` | V1 component library | multiplatform, compose, moko |
| `ui_components_v2` | V2 component library | multiplatform, compose, moko |
| `lynxmesh` | BLE mesh protocol | multiplatform, serialization, cinterop |
| `lynxmesh_kable` | BLE transport (Kable) | multiplatform |
| `lynxmesh_sqldelight` | Mesh database | multiplatform, sqlDelight |
| `lynxmesh_localstorage` | Mesh key-value storage | multiplatform |
| `lynxmeshapp` | Mesh app integration | multiplatform |

## Plugin Assignment Convention

- `compose` + `compose.compiler` — any module with `@Composable` code
- `serialization` — modules with `@Serializable` data classes
- `buildkonfig` — only `shared` (single source of environment config)
- `sqlDelight` — only `shared` and `lynxmesh_sqldelight`
- `moko.resources` — modules that define strings, images, or fonts
- `google.services` / `firebase.*` — only `androidApp`

## iOS Framework Configuration

Default: static frameworks. Toggle via `-PuseStaticFramework=false`. (Not exercised by `:sample-android` — Android only for this prompt.)

## Version Catalog

All dependency versions in `gradle/libs.versions.toml`. Root `build.gradle.kts` declares all plugins with `apply false` for consistent versioning. Access in modules: `libs.plugins.kotlinMultiplatform`, `libs.ktor.client.core`, etc.

## Compiler Options

All modules apply:

```kotlin
compilerOptions {
    freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
}
```

## SDK Versions

- `android.compileSdk` = 36, `android.targetSdk` = 36
- Argus uses `android.minSdk` = 24 (diverges from Canvas's 26 per tech-stack.md)
- `jvm.version` = 17

**Applies here:** plugins go through `libs.plugins.*` aliases; SDK values come from `libs.versions.android.*`; `compose` + `compose.compiler` are applied because the module has `@Composable` code; `serialization` applies because `ConsoleEventBus` calls `Json.encodeToString(ArgusEvent.serializer(), ...)`.

---

## naming/package-structure

# Package Structure

## Folder Naming

Use **singular** names for all packages. camelCase for multi-word.

## Nesting Rule

Create a subdirectory at **domain boundaries**.

## File Organization

One top-level class, interface, or enum per file. File name matches class name.

## Root Layer Structure

```
com.lynxal.<module>/
  data/
  domain/
  remote/
  ui/
  di/
  utils/
```

**Applies here:** root package `com.lynxal.argus.sample` with subpackages `ui/` and `debug/` (singular). One top-level declaration per file — `DebugTools.kt` holds only the interface; `DebugToolsImpl.kt` holds only the impl; `ConsoleEventBus.kt` holds only that class.

---

## validation/logging-conventions

# Logging Conventions

## Two Logging Systems

**`MeshLogger`** — for the `lynxmesh` module.
**`Logger`** — for application-level code. `:sample-android` uses `Logger` exclusively.

## Logger Tag Convention

Tags describe the **feature/domain area**, not the class name:

```kotlin
// Good
Logger.tag("Argus sample").debug("User tapped GET /users/1")

// Avoid
Logger.tag("SampleScreenKt").debug(...)
```

## Log Levels

- **error** — always include throwable if available.
- **debug** — state changes, operation progress.
- **verbose** — high-volume data.

**Applies here:** all five sample log buttons use `Logger.tag("Argus sample").<level> { ... }` with structured payloads. The ERROR button attaches a cause chain via `cause =`.

---

## testing/test-structure

# Test Structure & Naming

## Framework

`kotlin.test`, multiplatform-compatible. `runTest` for suspend.

## Test Placement

- `commonTest` default. `androidUnitTest` / `iosTest` for platform-specific cases only.

## Naming

Backtick names; describe behavior. Test class suffix `Test`.

## Structure (AAA)

Arrange-Act-Assert.

## Setup

`@BeforeTest` for shared setup.

**Applies here:** no automated tests ship in this prompt — validation is an APK + logcat inspection. If tests are added later for `EventLogBuffer` or the seam, they go in `commonTest` / `androidUnitTest` and follow AAA + backticked names.
