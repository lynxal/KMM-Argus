# AGENTS.md — Argus

A KMP in-app debug tooling library that embeds a Ktor server to serve a web UI over the local network for inspecting HTTP traffic, logs, and custom events on a unified timeline.

## Hard constraints

- **Debug-only by construction.** All Argus classes MUST be absent from release builds. This is CI-gated.
- `:sample:verifyReleaseHasNoArgus` — dexdumps release APK, scans for `Lcom/lynxal/argus/` and `Lio/ktor/server/`, fails if found.
- `:sample:verifyIosReleaseHasNoArgus` — builds iOS release framework, scans binary with `strings` for `kfun:com.lynxal.argus.` and `io.ktor.server.`, fails if found.
- The source-set seam: a `DebugTools` interface in `commonMain/` with zero Argus imports. Real impl in `androidDebug/`/`iosArgusEnabledMain/`, no-op in release variants.

## Build & test commands

```bash
# CI-equivalent verification (JVM + Android):
./gradlew jvmTest testDebugUnitTest testReleaseUnitTest \
  :argus-okhttp:test :argus-urlconnection:test \
  :sample:assembleDebug :sample:verifyReleaseHasNoArgus

# iOS tests (macOS only, CI gate):
./gradlew iosSimulatorArm64Test \
  :argus-ios:assembleArgus-iosReleaseXCFramework \
  :sample:verifyIosReleaseHasNoArgus

# Quick local check (does NOT run release gates):
./gradlew check
```

- `./gradlew :sample:check` runs both release-gate tasks.
- `ARGUS_SKIP_IOS_SMOKE=true` skips `ArgusSmokeTest` on CI (flaky Ktor/CIO stdout interleaving with KGP test reporter).
- `configuration-cache=false` in gradle.properties — do not re-enable.

## Module graph (one-way deps)

```
argus-webui (npm SPA, Vite + Vitest + Tailwind)
argus-webui-bundle (generates EncodedBundle.kt from webui dist/)
argus-core (event model, capture plugins, event bus, SQDelight DB)
argus-server-core (embedded Ktor server, REST + WS, depends on core + bundle)
argus-android (Android entry point, depends on core + server-core)
argus-ios (iOS entry point, depends on core + server-core)
argus-okhttp (JVM-only OkHttp interceptor, depends on core)
argus-urlconnection (JVM-only HttpURLConnection wrapper, depends on core)
sample (KMP demo app, Compose Multiplatform)
```

- `explicitApi()` is enabled in `argus-okhttp` and `argus-urlconnection` only.

## Codegen & build quirks

- **SQDelight** in `argus-core` (database `ArgusDatabase`, package `com.lynxal.argus.db`). Schema in `Argus.sq`. Changing it requires a Gradle sync.
- **argus-webui-bundle** has a custom `GenerateBundleTask`: reads `argus-webui/dist/`, gzips + base64-encodes each file, writes `EncodedBundle.kt` chunked at 60k chars to avoid JVM string limits. Before building `argus-webui-bundle`, `argus-webui` must have run `npm ci && npm run build` (Gradle tasks `npmCi -> npmBuild -> generateBundle` handle this automatically; `:argus-webui:assemble` triggers npm build).
- **No kapt or KSP.** Only SQDelight and Compose Compiler generate code.
- iOS frameworks are **static by default** (toggle via `-PuseStaticFramework=false`).
- JVM target is 17 across all modules.

## Testing

- Framework: `kotlin.test` (multiplatform). No Android instrumentation tests.
- Coroutine tests: `kotlinx.coroutines.test.runTest`.
- Test naming: backtick names preferred (`fun \`event round-trips\`()`).
- Structure: AAA (Arrange-Act-Assert).
- Platform-specific: `commonTest` for shared, `androidUnitTest` for Android-only (Robolectric 4.12.2 with `isIncludeAndroidResources = true`), `iosTest` for iOS.
- Mocking libraries: `ktor-client-mock`, `ktor-server-test-host`, `okhttp-mockwebserver`.
- `argus-webui` uses Vitest 3.0.0; custom token lint enforces design tokens over raw hex/pixel values (`npm run lint`).

## Commit conventions (agent-os/standards/workflow/commit-conventions.md)

- `<type>: <subject>` — imperative, max 72 chars. Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`, `build`.
- **No AI agent attribution trailers** (`Co-Authored-By`, `Signed-off-by`, etc.).
- Stage files explicitly by name. Do not mix unrelated changes.

## Local development against a consumer project

When iterating on a fix that needs to be exercised in a downstream KMP app (e.g. `ProvisionerKMP`), do **not** round-trip through Maven Central. Two options:

**Composite build (preferred — instant pickup, no publish step):**
In the consumer's `settings.gradle.kts` add at the top level:
```kotlin
includeBuild("../argus") {
    dependencySubstitution {
        substitute(module("com.lynxal.argus:argus-android")).using(project(":argus-android"))
        substitute(module("com.lynxal.argus:argus-ios")).using(project(":argus-ios"))
        // ...repeat for each argus-* artifact the consumer imports
    }
}
```
Source edits in `../argus` are picked up on the next Gradle sync. No version bumps, no publish step.

**publishToMavenLocal (fallback — exercises jar form before tagging):**
```bash
./gradlew -Pargus.localSnapshot=true publishToMavenLocal
```
Then in the consumer add `mavenLocal()` to `dependencyResolutionManagement.repositories` (before `mavenCentral()`) and point at `argus = "0.0.2-SNAPSHOT"` (or whatever `argus.version` is set to plus `-SNAPSHOT`). The version + snapshot suffix is wired through `argus/gradle.properties → argus.version` and the `argus.localSnapshot` flag; do not hard-code versions in module `coordinates(…)` calls.

## Reference

- Full README: `README.md` (integration guides, architecture diagram, config reference).
- Agent-OS standards: `agent-os/standards/` (17 categories for the parent Canvas app; useful for KMP patterns, testing conventions, commit format).
