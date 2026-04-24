# Standards for `:argus-webui-bundle`

The following standards apply to this work.

---

## kmp/module-build-conventions

### Plugin Assignment Convention

- `compose` + `compose.compiler` — any module with `@Composable` code
- `serialization` — modules with `@Serializable` data classes
- `buildkonfig` — only `shared` (single source of environment config)
- `sqlDelight` — only `shared` and `lynxmesh_sqldelight`
- `moko.resources` — modules that define strings, images, or fonts
- `google.services` / `firebase.*` — only `androidApp`

### iOS Framework Configuration

```kotlin
val useStaticFramework = findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true

listOf(iosArm64(), iosSimulatorArm64()).forEach {
    it.binaries.framework {
        baseName = "moduleName"
        isStatic = useStaticFramework
    }
}
```

Default: static frameworks. Toggle via `-PuseStaticFramework=false`. Each module's framework `baseName` matches the module name.

### Version Catalog

All dependency versions in `gradle/libs.versions.toml`. Root `build.gradle.kts` declares all plugins with `apply false` for consistent versioning. Access in modules: `libs.plugins.multiplatform`, `libs.ktor.client.core`, etc.

### Compiler Options

```kotlin
compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }
```

### SDK Versions (gradle.properties)

- `android.compileSdk` = 36, `android.targetSdk` = 36
- `jvm.version` = 17

*Argus deviates: `android.minSdk = 24` (broader reach for a debug-only library), governed by `agent-os/product/tech-stack.md`.*

---

## kmp/module-boundaries

### Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones.
- **Separate modules for platform-specific adapters** — isolate platform dependencies.
- **`common` has zero internal module dependencies** — it's the foundation.

### Applied to Argus

`:argus-webui-bundle` sits at the base of the Argus graph alongside `:argus-core`. It has no internal dependencies. `:argus-server-core` (future) depends on it; nothing depends upward.

---

## kmp/expect-actual-conventions

### File Naming

- Common declaration: `ClassName.kt` in `commonMain/`
- Platform actuals: `ClassName.android.kt`, `ClassName.ios.kt`

### Which Form to Use

| Form | When |
|------|------|
| `expect class` | Platform-specific constructor params or deps |
| `expect object` | Stateless singleton with platform impl |
| `expect fun` | Standalone function, esp. `@Composable` |
| `expect val` | Platform-specific singleton or constant |
| `expect interface` | Marker interface differing per platform |

### Source Set Structure

```
module/src/
  commonMain/    → expect declarations + shared logic
  androidMain/   → actual implementations (Android SDK)
  iosMain/       → actual implementations (Foundation/UIKit)
```

### Rules

- Keep expect declarations minimal — push shared logic to commonMain functions that call the expect.
- Prefer `expect fun` over `expect class` when no platform-specific state is needed.
- All expect declarations must have actuals for every target.

### Applied to this module

`Gzip.kt` (commonMain) declares `internal expect fun gunzip(bytes: ByteArray): ByteArray`. The JVM actual lives at `Gzip.jvmAndAndroid.kt` in a shared intermediate source set (`jvmAndAndroidMain`) that both `jvmMain` and `androidMain` depend on. The iOS actual lives at `Gzip.ios.kt` in `iosMain`. `expect fun` chosen because there's no platform-specific state.

---

## naming/package-structure

### Folder Naming

Use **singular** names for all packages: `data/`, `repository/`, `service/`, `useCase/` (camelCase for multi-word).

### File Organization

One top-level class, interface, or enum per file. The file name must match the class name. Exceptions: private helpers or tightly coupled sealed subtypes defined inside the same sealed parent.

### Root Layer Structure

```
com.lynxal.<module>/
  data/    domain/    remote/    ui/    di/    utils/
```

### Applied to this module

Package root: `com.lynxal.argus.webui`. This module has only five source files and a generated one — flat package, no sub-folders. One top-level declaration per file (`BundleEntry.kt` → `class BundleEntry`; `ArgusUiBundle.kt` → `object ArgusUiBundle`; `Gzip.kt` → `expect fun gunzip`). The generated `EncodedBundle.kt` contains `class EncodedEntry` + `object EncodedBundle` — both `internal`, both generated, acceptable as an exception since they are tightly coupled and not hand-edited.

---

## naming/code-documentation

### Format

KDoc (`/** */`) for public API. Inline comments (`//`) for non-trivial logic within function bodies.

### Rules

- Document the **why**, not the **what**.
- Include `@see` references when interactions are not obvious.
- For formulas or magic numbers, explain the derivation.
- Keep comments up to date — stale comments are worse than no comments.
- Do not add comments to code you did not write or change.

### Applied to this module

KDoc on the public `ArgusUiBundle` object (purpose: serve SPA over HTTP; note the lazy decode) and `BundleEntry` class (contract: `bytes` decodes on first access). Inline comments in:
- The generator: explain the 60 000-char chunk boundary (JVM UTF-8 constant-pool cap).
- `Gzip.ios.kt`: explain the gzip-envelope parsing (magic bytes, optional fields, feeding raw deflate to `COMPRESSION_ZLIB`).

No comments on the hand-written `ArgusUiBundle.get` fallback logic — the code reads cleanly as-is.

---

## bluetooth-mesh/bytearray-classes (adapted)

### Rule: Data class with ByteArray → override equals/hashCode

Kotlin `data class` uses reference equality for `ByteArray` fields by default. Use `contentEquals()` and `contentHashCode()`.

### Rule: Simple ByteArray wrappers → regular class

When a class is just a thin wrapper around ByteArray with no need for `copy()`/destructuring, use a regular class.

### Applied to this module

`BundleEntry` wraps a lazily-decoded `ByteArray` plus a `contentType: String`. No need for `copy()`/destructuring. Use a regular `class`; override `equals` and `hashCode` using `bytes.contentEquals` and `bytes.contentHashCode()`. Deviation from the user's literal spec (which used `data class`) is called out in the commit message.

---

## workflow/commit-conventions

### Commit Message Format

```
<type>: <subject> [optional (#issue)]

[optional body]
```

### Types

`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` / `perf` / `ci` / `build`

### Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body: explain **why**, not **what**. Wrap at 72 characters.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any trailer that identifies an AI agent.

### Applied to this module

Use `feat(webui-bundle): …`, `chore(webui-bundle): …`, `test(webui-bundle): …` subjects. No Co-Authored-By trailers (also enforced by the user's standing `feedback_no_ai_attribution` memory on this repo).
