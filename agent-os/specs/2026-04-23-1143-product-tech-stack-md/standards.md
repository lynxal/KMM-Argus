# Standards for Argus Tech Stack

The five standards below apply to this work. Full content is inlined so the spec remains usable if `agent-os/standards/` drifts later. Divergences are noted in `shape.md`.

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

Each module's framework `baseName` matches the module name (e.g., `shared`, `common`, `lynxmesh`).

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

Additional opt-ins added per module as needed:
- `kotlin.uuid.ExperimentalUuidApi` — modules using UUID
- Compose resource opt-ins — UI modules

## iOS C-Interop

`lynxmesh` module uses Swift Crypto backend via `.def` files and custom Gradle tasks:

```
SwiftCryptoBackend/build.gradle.kts → xcodebuild → .framework
    → copied to lynxmesh/dependencies/SwiftCrypto/{target}/
    → consumed via cinterop in lynxmesh/build.gradle.kts
```

## SDK Versions (gradle.properties)

- `android.compileSdk` = 36, `android.targetSdk` = 36, `android.minSdk` = 26
- `jvm.version` = 17
- Gradle JVM args: `-Xmx8192M`, max workers: 16

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

## kmp/version-management

# Version Management

## Version Format

`{major}.{minor}.{buildId}` — e.g., `0.7.1710340000000`

- `appVersionMajor` / `appVersionMinor`: manually bumped in root `build.gradle.kts`
- `appVersionBuildId`: `System.currentTimeMillis()` — every build is unique for traceability
- `appVersionDisplay`: `{major}.{minor}.{buildId}-{flavor}` (includes build flavor)

```kotlin
val appVersionMajor by extra { 0 }
val appVersionMinor by extra { 7 }
val appVersionBuildId: Long by extra { System.currentTimeMillis() }
val appVersionName by extra { "$appVersionMajor.$appVersionMinor.$appVersionBuildId" }
```

## Android versionCode

```kotlin
versionCode = appVersionMajor * 100 + appVersionMinor + 1
```

Historical formula. The `+1` is an artifact (ensures > 0 when major=0, minor=0).

## BuildKonfig Flavors

Three environments configured in `shared/build.gradle.kts`:

| Flavor | Base URL | App ID Suffix | Signing |
|--------|----------|---------------|---------|
| `development` | dev-residential-api.lynxal.com | `.dev` | localBuild2 |
| `staging` | lynxal-residential-api-staging-*.azurewebsites.net | `.stg` | localBuild3 |
| `production` | lynxal-api.azurewebsites.net | (none) | localBuild |

Select flavor via gradle property: `-Pbuildkonfig.flavor=development`
Default in `gradle.properties`: `buildkonfig.flavor=development`

BuildKonfig fields: `BASE_URL`, `GOOGLE_WEB_CLIENT_ID`, `IS_PRODUCTION`, `REMOTE_TYPE`, `BUILD_INFO`

Access: `com.lynxal.canvasprovisioner.BuildKonfig.BASE_URL`

## Android Manifest Placeholders

Each flavor sets distinct app name and launcher icon per build type:

```kotlin
// development + debug
manifestPlaceholders["appName"] = "@string/app_name_dev"
manifestPlaceholders["appIcon"] = "@mipmap/ic_launcher_dev_debug"

// production + release
manifestPlaceholders["appName"] = "@string/app_name"
manifestPlaceholders["appIcon"] = "@mipmap/ic_launcher_prod_release"
```

Pattern: `ic_launcher_{env}_{buildType}` for icons.

## Firebase App Distribution

- Dev/staging: `fad-service-account-dev.json`, group `all-testers`
- Production: `fad-service-account.json`, group `all-testers`
- All flavors distribute APK artifacts

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
