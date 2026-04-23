# References for Argus Tech Stack

Both references were studied for their Gradle + KMP module layout. Argus reuses these idioms; there's no code inheritance.

## Similar Implementations

### KMMLogging

- **Location:** `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/`
- **Relevance:** Same distribution pattern — a thin KMP library module with an `exampleApp` paired alongside, published to a Maven repo. Argus's `:argus-core`, `:argus-webui-bundle`, and `:argus-server-core` will follow the same structural template.
- **Key patterns to borrow:**
  - `settings.gradle.kts` enables `TYPESAFE_PROJECT_ACCESSORS` and explicitly `include`s each module.
  - Root `build.gradle.kts` declares all plugins with `apply false` for consistent cross-module versioning (matches `kmp/module-build-conventions`).
  - `gradle/libs.versions.toml` holds every version and plugin alias; modules consume via `alias(libs.plugins.kotlinMultiplatform)`, `libs.kotlin.datetime`, etc.
  - Per-module `build.gradle.kts` applies `kotlinMultiplatform` + `androidLibrary`, declares `androidTarget()` and the iOS targets, sets `compileSdk` / `minSdk` from `libs.versions.android.*`, and uses `jvmToolchain(findProperty("jvm.version"))` to align JVM toolchains.
  - Namespace pattern `com.lynxal.<module>` (confirms `naming/package-structure` is already standard across Lynxal KMP libraries).

### KmmPermissions

- **Location:** `/Users/vardan.kurkchiyan/AndroidStudioProjects/KmmPermissions/`
- **Relevance:** Same shape as KMMLogging — a single `permissions` library module plus an `exampleApp` and `exampleIosApp`. Confirms this is the convention for Lynxal KMP libraries, not a one-off.
- **Key patterns to borrow:**
  - Dual example apps (Android + iOS) — Argus will likely want the same for development/validation once Phase 4 starts.
  - Same `settings.gradle.kts`/root build/version-catalog layout as KMMLogging.
