# Argus Distribution — Shaping Notes

## Scope

Publish four Argus modules to Maven Central and lock in a debug-only consumer pattern that guarantees zero Argus classes ship in release builds.

Artifacts:

| Module | Coordinates |
|---|---|
| `:argus-core` | `com.lynxal.argus:argus-core:0.0.1` |
| `:argus-server-core` | `com.lynxal.argus:argus-server-core:0.0.1` |
| `:argus-webui-bundle` | `com.lynxal.argus:argus-webui-bundle:0.0.1` |
| `:argus-android` | `com.lynxal.argus:argus-android:0.0.1` |

`:argus-ios` is Phase 4, deferred.

## Decisions

- **Source-set layout:** keep KMP names (`androidMain` / `androidDebug` / `androidRelease`). The seam in `:sample-android` already works; brief wording (`src/debug/`) was generic.
- **Initial version:** `0.0.1` for all four artifacts. Matches KMMLogging's early-release convention.
- **Publishing plugin:** `com.vanniktech.maven.publish:0.33.0` per module + `signing`. No root convention plugin (mirrors KMMLogging exactly).
- **Signing:** in-memory via CI env vars (`ORG_GRADLE_PROJECT_signingInMemoryKey`, etc.).
- **APK verification:** Gradle task `verifyReleaseHasNoArgus` in `:sample-android` using `dexdump`; CI invokes it. Gates on `com/lynxal/argus/`, `io/ktor/server/`, `com/lynxal/argus/webui/`.
- **CI triggers:** Publish workflow on `release: [released]` + `workflow_dispatch`. Verify workflow on every PR + push to `main`.
- **No AI attribution** in commits (per repo memory + workflow/commit-conventions standard).
- **iOS:** out of scope; defer until an iOS sample exists to validate the seam.

## Context

- **Visuals:** None.
- **References:**
  - `KMMLogging/logging/build.gradle.kts:81-114` — canonical `mavenPublishing {}` DSL.
  - `KMMLogging/.github/workflows/publishToMavenCentral.yml` — canonical publish workflow.
  - `KMMLogging/.github/workflows/buildLibrary.yml` — reusable build workflow.
  - `KmmPermissions/permissions/build.gradle.kts:67-100` — sibling using identical pattern.
  - `argus/sample-android/src/androidMain/.../debug/DebugTools.kt` + `androidDebug` / `androidRelease` impls — canonical seam already implemented.
- **Product alignment:** Roadmap Phase 1 explicitly states distribution model — debug-only, no no-op module, release builds contain zero Argus code. This spec implements that policy.

## Standards Applied

- **kmp/module-build-conventions** — version-catalog plugin layout, JVM 17 toolchain, `-opt-in=kotlin.time.ExperimentalTime` compiler arg.
- **validation/no-internal-apis** — applies broadly; nothing in this spec uses internal APIs, but the published surface must remain on public Kotlin/Gradle APIs.
- **workflow/commit-conventions** — `feat`/`build`/`ci` types; no AI trailers; staged-by-name commits.
