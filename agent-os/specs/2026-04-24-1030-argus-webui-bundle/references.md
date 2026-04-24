# References for `:argus-webui-bundle`

## Similar Implementations

### `:argus-core` module build

- **Location:** `argus-core/build.gradle.kts`
- **Relevance:** The canonical KMP module layout in this repo. `:argus-webui-bundle` mirrors its structure: `alias(libs.plugins.kotlinMultiplatform)` + `alias(libs.plugins.androidLibrary)`, `androidTarget()` + three iOS targets + `jvm()`, `android { namespace = …; compileSdk/minSdk from catalog; JavaVersion.VERSION_17; jvmToolchain }`, `compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }`.
- **Key patterns to borrow:** framework config loop for iOS targets; `listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { it.binaries.framework { baseName = "…"; isStatic = … } }`; `(findProperty("jvm.version") as String).toInt()` for the toolchain. The *only* divergences in `:argus-webui-bundle` are (a) no external dependencies, (b) the `jvmAndAndroidMain` intermediate source set, and (c) the `GenerateBundleTask` wiring.

### `:argus-webui` SPA producer

- **Location:** `argus-webui/` (standalone npm project); spec at `agent-os/specs/2026-04-23-2345-argus-webui/`.
- **Relevance:** This is the producer whose `dist/` output this spec packages. The `:argus-webui:npmBuild` Gradle wrapper (created in this spec) invokes `npm run build`, defined in `argus-webui/package.json`:
  ```json
  "scripts": {
    "build": "npm run tokens && tsc --noEmit && vite build",
    "tokens": "tsx scripts/build-tokens.ts"
  }
  ```
  Output: `argus-webui/dist/` (~272 KB at the time of this spec).
- **Key patterns to borrow:** `argus-webui/vite.config.ts` sets `build.cssCodeSplit: false` and `manualChunks: undefined` — a single JS + single CSS bundle. This matters because the bundle module's size budget (300 KB `.kt` file) assumes that structure; if the webui build ever splits assets heavily, more base64 chunk overhead accumulates but no structural change is needed in `:argus-webui-bundle`.

### Product tech-stack for the module

- **Location:** `agent-os/product/tech-stack.md` lines 23 and 78-89
- **Relevance:** Authoritative description of the `generateBundle` task. Dictates inputs (`dist/`), outputs (a Kotlin file containing a base64 + content-type map), and the runtime shape (`ArgusUiBundle.files`).
- **Key patterns to borrow:** the tech-stack spec is honored literally on inputs, outputs, runtime API, and dependency wiring. The only operational divergences are (a) generated file location (`build/generated/…` instead of `src/commonMain/generated/` — standard Gradle practice; gitignored via `build/`), and (b) `BundleEntry` is a regular `class` instead of `data class` to avoid the `ByteArray` structural-equality pitfall called out in `agent-os/standards/bluetooth-mesh/bytearray-classes.md`.

## Reference files (not similar code, but necessary context)

- `gradle/libs.versions.toml` — version catalog; this module consumes `libs.plugins.kotlinMultiplatform` and `libs.plugins.androidLibrary`, plus `libs.versions.android.compileSdk`/`minSdk`. No new entries needed.
- `gradle.properties` — confirms `jvm.version=17`, `kotlin.mpp.applyDefaultHierarchyTemplate=true` (so don't call `applyDefaultHierarchyTemplate()` in the module build), `org.gradle.configuration-cache=false`, `kotlin.native.osVersionMin.ios_x64=17.0`.
- `settings.gradle.kts` — `enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")` is on, so the future `:argus-server-core` will consume this module as `projects.argusWebuiBundle`.
- `.gitignore` — `build/` is ignored at the repo root, so the generated `EncodedBundle.kt` under `build/generated/…` is safe from accidental commits.
