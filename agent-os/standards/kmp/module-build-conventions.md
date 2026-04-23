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
