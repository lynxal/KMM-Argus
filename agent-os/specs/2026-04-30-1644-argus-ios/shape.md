# argus-ios — Shaping Notes

## Scope

Phase 4 of the Argus roadmap: deliver an iOS host module (`:argus-ios`) and a reference sample app (`:sample-ios`) that mirror their Android counterparts, plus the same debug-only distribution contract enforced via a Gradle gate that scans an `xcodebuild -configuration Release` artifact for Argus / Ktor-server symbols.

A small `:argus-server-core` cleanup is bundled in (collapse the now-redundant `expect class ArgusServer` to a regular `commonMain` class) because the existing Android and iOS actuals were already byte-identical and `io.ktor.server.cio` is multiplatform.

## Decisions

- **Server actual:** Collapse `expect class ArgusServer` to a single `commonMain` class. Delete the `jvmAndAndroidMain/` and `iosMain/` source files (only ArgusServer.kt lived there) and the source-set wiring in the build script. Aligns with `kmp/expect-actual-conventions` ("Keep expect declarations minimal — push shared logic to commonMain").
- **`ArgusConfigBuilder` location:** Move from `:argus-android/androidMain/` to `:argus-server-core/commonMain/`. Pure Kotlin, no Android imports — sharing the builder avoids drift between the Android and iOS facades.
- **Persistence on iOS:** Wire SqlDelight `NativeSqliteDriver` via a new `IosArgusDriverFactory`. Full parity with Android's `AndroidArgusDriverFactory`. Increases iOS framework size — accepted trade-off for a debug-only artifact.
- **Release seam (iOS):** Swift-side `DebugTools` protocol + two Kotlin source sets (`iosArgusEnabledMain` / `iosArgusDisabledMain`) selected by `-PargusEnabled`. Xcode build phase passes `true` for Debug, `false` for Release. A `:sample-ios:verifyReleaseHasNoArgus` Gradle task runs `xcodebuild -configuration Release` on the simulator destination (no signing identity required) and greps the produced framework binary with `nm`/`strings` for Argus + Ktor-server symbols.
- **Sample iOS demo scope:** Match the Ktor-applicable subset of `:sample-android` — GET buttons, correlated pair, five log levels, custom event. Skip OkHttp and HttpURLConnection demo buttons (engines are JVM-only).
- **No Compose Multiplatform on iOS for the sample.** SwiftUI screen is sufficient for one screen, eliminates a dependency surface.
- **No Kotlin/Compose/AGP version bump.** `KotlinBaseProject` is referenced for Xcode project layout only, not for version parity. Argus stays on Kotlin 2.2.0 / Compose MP 1.8.2 / AGP 8.11.0.
- **Out of scope:** URLSession capture for non-Ktor iOS apps (per user brief). mDNS/Bonjour discovery on iOS (future work).

## Context

- **Visuals:** None. Argus UI is unchanged.
- **References:**
  - `:argus-android` — facade pattern (`Argus.start()`, `ArgusHandle`, `AppInfoBuilder`, `LocalIp`, `AndroidArgusDriverFactory`).
  - `:sample-android` — debug seam pattern (interface in main source set, real impl in debug source set, no-op in release source set, `verifyReleaseHasNoArgus` Gradle task).
  - `../KotlinBaseProject/iosApp/` — Xcode project layout, build phase script for `embedAndSignAppleFrameworkForXcode`, Swift entry-point pattern.
- **Product alignment:** Closes Phase 4 in `agent-os/product/roadmap.md`. Updates `agent-os/product/tech-stack.md` to reflect that server actuals now live in `commonMain` (the original spec proposed `host-module/<platform>Main`, but the implementation diverged when Phase 1–3 shipped, and this work formalizes that).

## Standards Applied

- `kmp/expect-actual-conventions` — justifies collapsing `ArgusServer` to a plain `commonMain` class.
- `kmp/module-build-conventions` — iOS framework block, `useStaticFramework` toggle, `baseName` matches module name.
- `kmp/module-boundaries` — `:argus-ios` depends on `:argus-server-core` + `:argus-core`; `:sample-ios` debug variant depends on `:argus-ios`.
- `persistence/sqldelight-conventions` — platform driver factories. `IosArgusDriverFactory` mirrors `AndroidArgusDriverFactory`.
- `platform/init-and-di` — iOS init is manual from Swift; the sample's `iOSApp.init()` is the call site.
- `workflow/commit-conventions` — feat/refactor/docs prefixes; no AI attribution trailer (matches local memory `feedback_no_ai_attribution.md`).

## Risks

- **Source-set / dependency sync:** The `argusEnabled` Gradle property must drive **both** the source-dir selection and the dependency wiring for `:sample-ios`. Out-of-sync wiring would let the release variant compile but link `:argus-ios`. The `verifyReleaseHasNoArgus` gate is what catches that.
- **Framework size:** `:argus-ios` exports Ktor server CIO + SqlDelight native driver. First-build size should be measured and noted in the README. Acceptable for a debug-only artifact, but worth the visibility.
- **`getifaddrs` cinterop:** `platform.posix` is part of the Kotlin/Native stdlib (no `.def` file needed). If `cValue<sockaddr_in>` casting turns out fiddly at implementation time, fall back to `Network.framework` via Objective-C interop.
