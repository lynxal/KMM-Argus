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
./gradlew :verifyVersionPins \
  jvmTest testDebugUnitTest testReleaseUnitTest \
  :argus-okhttp:test :argus-urlconnection:test \
  :sample:assembleDebug :sample:verifyReleaseHasNoArgus

# iOS tests (macOS only, CI gate):
./gradlew iosSimulatorArm64Test \
  :argus-ios:assembleArgus-iosReleaseXCFramework \
  :sample:verifyIosReleaseHasNoArgus

# Quick local check (does NOT run release gates):
./gradlew check
```

- `./gradlew :sample:check` runs both release-gate tasks plus `:verifyVersionPins` (the root project has no `check` of its own).
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
- **BuildKonfig** in `argus-core` generates `ArgusBuildKonfig.ARGUS_VERSION` from the `argus.version` Gradle property, exposed as a public object so `:argus-android` and `:argus-ios` can read it. That constant is what `/api/info` and the WebSocket `hello` frame report — never hardcode a version anywhere; `:verifyVersionPins` fails the build if a literal reappears.
- **No kapt or KSP.** SQDelight, BuildKonfig, and Compose Compiler are the only code generators.
- **Stale AGP bundle output.** A `NoClassDefFoundError` for a class that plainly exists in `<module>/build/tmp/kotlin-classes/debug/` means AGP's `bundleLibRuntimeToDir<Variant>` output is frozen at an older compile — it is what gets packaged, and Gradle holds it UP-TO-DATE, so neither `assembleDebug` nor an IDE rebuild repairs it. Diff the two directories to confirm, then `rm -rf */build/intermediates` and rebuild. Verify with `dexdump` on the APK, not by re-running the build.
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
Then in the consumer add `mavenLocal()` to `dependencyResolutionManagement.repositories` (before `mavenCentral()`) and point at `argus = "<argus.version>-SNAPSHOT"` (the value from `gradle.properties` plus `-SNAPSHOT`). The version + snapshot suffix is wired through `argus/gradle.properties → argus.version` and the `argus.localSnapshot` flag; do not hard-code versions in module `coordinates(…)` calls.

## Release

`gradle.properties → argus.version` is the only place the version is written.
Module `coordinates(…)` read it, and `:argus-core`'s `buildkonfig` block stamps
it into `ArgusBuildKonfig.ARGUS_VERSION`, which is what `/api/info` and the
WebSocket `hello` frame report. Docs, `argus-webui/package.json`, and
`Package.swift` restate it by hand; `:verifyVersionPins` fails the build when any
of them disagrees, and also fails if a hardcoded `ARGUS_VERSION` literal reappears.

1. Bump `argus.version` in `gradle.properties`.
2. Update every hand-written pin, then `./gradlew :verifyVersionPins` until green:
   `README.md` (§2 status row, dependency snippets, module table), `AGENTS.md`,
   `argus-webui/package.json` + `package-lock.json`, and the `Package.swift`
   asset URL.
3. Dispatch **both** Verify workflows against `main`. Neither fires at release
   time — see the comment at the top of `publishToMavenCentral.yml`.
4. Tag the merge commit with the bare version, **no `v` prefix** — `git tag 1.0.0`.
   The tag must match `argus.version` exactly; `publishToMavenCentral.yml` builds
   the SPM asset URL from the tag name, and nothing enforces the match.
5. Create the GitHub Release for that tag. This is what triggers
   `publishToMavenCentral.yml`: it publishes all seven artifacts to Maven Central
   (**irreversible** — a published version cannot be deleted or replaced), builds
   the XCFramework, uploads `argus_ios.xcframework.zip` as a release asset, and
   appends the asset URL and its SHA-256 to the release notes.
6. Copy that checksum into `Package.swift`'s `binaryTarget` and commit it to
   `main`. It can only be done after the fact: the checksum is of the zip CI
   built, so a locally built zip would not match.

## Reference

- Full README: `README.md` (integration guides, architecture diagram, config reference).
- Agent-OS standards: `agent-os/standards/` (17 categories for the parent Canvas app; useful for KMP patterns, testing conventions, commit format).
