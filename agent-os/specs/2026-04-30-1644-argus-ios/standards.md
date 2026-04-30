# Standards for argus-ios

The following standards apply to this work.

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

**Why this applies:** justifies collapsing `ArgusServer` to a plain `commonMain` class — no platform-specific state is involved, the dependency (`io.ktor.server.cio`) is multiplatform, and both existing actuals are byte-identical.

---

## kmp/module-build-conventions

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

Each module's framework `baseName` matches the module name.

## Version Catalog

All dependency versions in `gradle/libs.versions.toml`. Root `build.gradle.kts` declares all
plugins with `apply false` for consistent versioning.

## Compiler Options

All modules apply:

```kotlin
compilerOptions {
    freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
}
```

**Why this applies:** `:argus-ios` and `:sample-ios` use `iosX64()` + `iosArm64()` + `iosSimulatorArm64()` per the existing Argus modules' convention; framework `baseName` matches the module name (`argus-ios`, `SampleIos`); `useStaticFramework` toggle is honored.

---

## kmp/module-boundaries

# Module Boundaries

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies
- **`common` has zero internal module dependencies** — it's the foundation

**Why this applies:** Argus's dependency flow is one-way: `:sample-ios` (debug) → `:argus-ios` → `:argus-server-core` → `:argus-core` (and `:argus-webui-bundle` as a sibling under `:argus-server-core`). No upward edges.

---

## persistence/sqldelight-conventions

# SQLDelight Conventions

## Driver Configuration

Platform-specific `SqlDriver` creation via expect/actual in:
- `androidMain/.../SqlDriverCreator.android.kt`
- `iosMain/.../SqlDriverCreator.ios.kt`

**Why this applies:** Argus uses an interface (`ArgusDriverFactory`) instead of expect/actual, but the spirit of the rule (platform driver per platform module) is preserved. `:argus-android` provides `AndroidArgusDriverFactory(AndroidSqliteDriver)`; `:argus-ios` will provide `IosArgusDriverFactory(NativeSqliteDriver)`.

---

## platform/init-and-di

# Platform Init & DI

## Initialization Flow

### iOS
Manual initialization from Swift with pre/post hooks:

```swift
struct iOSApp: App {
    let appInitHelper = AppInitHelper()
    init() {
        appInitHelper.preInit()   // Firebase, etc.
        App_iosKt.doInitApp(appModuleFactory: IosAppModuleFactory())
        appInitHelper.postInit()  // Post-Koin setup
    }
}
```

This asymmetry is intentional — Android lifecycle requires `onCreate()`, iOS needs Swift-side control.

**Why this applies:** the `:sample-ios` Xcode app's `iOSApp.init()` is the call site for the sample's `DebugToolsImpl`. Mirrors the standard pattern even though the sample doesn't use Koin.

---

## workflow/commit-conventions

# Commit Conventions

## Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body (optional): explain **why**, not **what**. Wrap at 72 characters.
- Reference GitHub issues when applicable: `(#123)`.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any
  trailer that identifies an AI agent. Commits should be indistinguishable from human-authored
  commits.

### Types

`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`, `build`.

**Why this applies:** all commits made under this spec follow the convention. No `Co-Authored-By` trailer (also recorded in local memory `feedback_no_ai_attribution.md`).
