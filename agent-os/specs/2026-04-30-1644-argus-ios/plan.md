# Feature: argus-ios — iOS host module + sample app

Spec slug: `2026-04-30-1644-argus-ios`

## Context

Phase 4 of the Argus roadmap (`agent-os/product/roadmap.md` § *Phase 4: iOS / KMP completion*) is the only remaining work to deliver the originally-scoped product: an in-app debug inspector that runs on Android and iOS hosts of Lynxal Canvas/IoT KMP apps, with parity for the Ktor client capture path, KMMLogging delegate, and embedded server. Phase 1–3 shipped Android and the KMP foundation (`:argus-core`, `:argus-server-core`, `:argus-webui-bundle`) compiles and links for iOS targets, but no iOS host facade or sample exists yet.

This work delivers (a) an `:argus-ios` host module analogous to `:argus-android`, (b) a `:sample-ios` reference app that mirrors the demo content of `:sample-android` for the Ktor-applicable subset, and (c) the same debug-only distribution contract that Android enforces, hardened for iOS via a `verifyReleaseHasNoArgus` Gradle gate that runs against an `xcodebuild archive -configuration Release` artifact.

A small `:argus-server-core` cleanup is bundled in: the `expect class ArgusServer` is collapsed to a regular `commonMain` class because both existing actuals (`jvmAndAndroidMain` and `iosMain`) are byte-identical and the dependency chain (`io.ktor.server.cio`) is already declared in `commonMain`. This eliminates the `expect/actual` split and removes the only source files in those two source sets.

## Out of scope (per user brief)

- URLSession capture for non-Ktor iOS apps. iOS users must use Ktor with the existing `:argus-core` Ktor plugin.
- mDNS / Bonjour discovery — the iOS handle exposes the URL, no on-network advertisement.
- Compose Multiplatform on iOS for the sample (SwiftUI is sufficient for the demo).
- Bumping Kotlin / Compose / AGP versions to match `KotlinBaseProject` (Argus stays on Kotlin 2.2.0 / Compose MP 1.8.2 / AGP 8.11.0; KotlinBaseProject is referenced for Xcode project structure only, not version parity).

## Decisions (confirmed)

- **Server actual location:** Collapse to `commonMain` (option 4). Delete both platform actuals.
- **Persistence on iOS:** Yes — wire `NativeSqliteDriver` via a new `IosArgusDriverFactory`. Full parity with Android.
- **Release seam:** DEBUG seam in Swift + Gradle task that runs `xcodebuild archive -configuration Release` and scans the produced `.app`/`.framework` binary for Argus / Ktor-server symbols. Hooked into `:sample-ios:check`.
- **Sample scope:** Match Ktor-applicable `:sample-android` features. Skip the two engine demo buttons (`:argus-okhttp`, `:argus-urlconnection` are JVM-only).

## Critical files

### Read / reference (no changes)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/db/ArgusDriverFactory.kt` — interface to implement on iOS.
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/persistence/SqlDelightEventStore.kt` — already KMP, used unchanged.
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfig.kt` — config data class, used unchanged.
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/{Argus,ArgusHandle,AppInfoBuilder,LocalIp}.kt` — the templates iOS mirrors.
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/db/AndroidArgusDriverFactory.kt` — the template `IosArgusDriverFactory` mirrors.
- `sample-android/src/{androidMain,androidDebug,androidRelease,commonMain}/...` — reference for the sample seam, demo screen, and release gate.
- `../KotlinBaseProject/iosApp/` and `../KotlinBaseProject/composeApp/build.gradle.kts` — reference Xcode project layout and KMP iOS Gradle config.

### Modify
- `settings.gradle.kts` — add `:argus-ios` and `:sample-ios`.
- `argus-server-core/build.gradle.kts` — remove `jvmAndAndroidMain` and `iosMain` source-set wiring (will be empty after the move).
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusServer.kt` — drop `expect`, paste actual body in.
- `argus-server-core/src/{jvmAndAndroidMain,iosMain}/kotlin/com/lynxal/argus/server/ArgusServer.kt` — **delete**.
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusConfigBuilder.kt` — **move** to `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfigBuilder.kt` (pure Kotlin, no Android imports; keeping a single builder avoids drift between Android and iOS facades). Update `argus-android/src/.../Argus.kt` import accordingly. Keep public API surface identical (`public class ArgusConfigBuilder internal constructor(appInfo: AppInfo)`).
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/db/ArgusDriverFactory.kt` — update KDoc that says "iOS will arrive in Phase 4" (it has now).
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/persistence/SqlDelightEventStore.kt` — update KDoc that says "iOS: deferred to Phase 4".
- `agent-os/product/tech-stack.md` — update the actual-location table footnote (actuals now live in `commonMain`, not host modules) and tick `:argus-ios` from "Phase 4" to "shipped".
- `agent-os/product/roadmap.md` — mark Phase 4 complete.
- `README.md` — add a § *Installation — iOS* section mirroring § *Installation — Android* (debug-only contract, seam-interface example, sample app reference).

### New
- `argus-ios/build.gradle.kts`
- `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/Argus.kt` — public entry point (`Argus.start(configure)`). Returns `ArgusHandle`.
- `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/ArgusHandle.kt` — same shape as Android (`eventBus`, `url: StateFlow<String?>`, `stop()`); uses `NSLog` for the listening-on log.
- `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/AppInfoBuilder.kt` — `pkg` from `NSBundle.mainBundle.bundleIdentifier`, `versionName` from `infoDictionary["CFBundleShortVersionString"]`, `device` from `"${UIDevice.currentDevice.model} ${UIDevice.currentDevice.systemVersion}"`. `argusVersion` is a const string (no `BuildConfig` on iOS — set explicitly in code; matches the publishing version).
- `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/LocalIp.kt` — POSIX `getifaddrs` via `platform.posix` cinterop. Filters for IPv4, non-loopback, RFC1918 site-local addresses (matches Android's `isSiteLocalAddress` heuristic).
- `argus-ios/src/iosMain/kotlin/com/lynxal/argus/db/IosArgusDriverFactory.kt` — wraps `NativeSqliteDriver(ArgusDatabase.Schema, "argus.db")`. SQLDelight stores the file under the app's default sandboxed location for that driver.
- `argus-ios/.gitignore`, `argus-ios/README.md` (publishing metadata mirror of `argus-android`).
- `sample-ios/build.gradle.kts` — KMP module producing an iOS framework `SampleIos`. Uses a Gradle property (`-PargusEnabled=true|false`) to flip the `iosMain` dependency on `:argus-ios` and pick the matching `DebugToolsImpl` source dir. Defaults to `false` so plain `./gradlew build` produces the release-clean variant.
- `sample-ios/src/commonMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt` — Kotlin interface, imports nothing from `com.lynxal.argus.*` (mirrors the Android seam contract).
- `sample-ios/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleViewModel.kt` — `kotlinx.coroutines`-based VM exposing the buttons listed below; consumed from Swift.
- `sample-ios/src/iosArgusEnabledMain/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` — real impl: starts Argus, builds Ktor `HttpClient` with `ArgusPlugin`, installs `ArgusLoggerDelegate`, exposes `publishCustom` and `fireCorrelatedPair`. **Does not** import `:argus-okhttp` or `:argus-urlconnection` (JVM-only).
- `sample-ios/src/iosArgusDisabledMain/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` — no-op impl: emits `MutableStateFlow(null)` for the URL, plain Ktor `HttpClient(Darwin)`, no Argus imports. Header comment: *"Invariant: this file must not import anything from com.lynxal.argus.*"* — same wording as `androidRelease/DebugToolsImpl.kt`.
- `sample-ios/iosApp/iosApp.xcodeproj` + `iosApp/{iOSApp.swift,ContentView.swift,SampleScreen.swift,Info.plist,Assets.xcassets/}` — SwiftUI app with one screen. Two configurations:
  - Debug → custom build phase runs `./gradlew :sample-ios:embedAndSignAppleFrameworkForXcode -PargusEnabled=true`.
  - Release → same task with `-PargusEnabled=false`.
  Both link the produced `SampleIos.framework`; the framework's contents differ per configuration.

## Implementation tasks

### Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-30-1644-argus-ios/` with:
- `plan.md` — copy of this file.
- `shape.md` — see *Shape notes* below.
- `standards.md` — concatenated content of the standards listed in *Standards Applied*.
- `references.md` — pointers to `:argus-android`, `:sample-android`, and `../KotlinBaseProject` with the specific files that were templates.
- `visuals/` — empty (no mockups; Argus UI is unchanged).

### Task 2 — Collapse `expect class ArgusServer` to a single common class

1. In `argus-server-core/src/commonMain/.../ArgusServer.kt`: drop the `expect` keyword, paste the body from `iosMain/.../ArgusServer.kt` verbatim (it equals the JVM body), drop the `actual` keywords on the constructor and members.
2. Delete `argus-server-core/src/jvmAndAndroidMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`.
3. Delete `argus-server-core/src/iosMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`.
4. In `argus-server-core/build.gradle.kts`, delete the `val jvmAndAndroidMain by creating { dependsOn(commonMain) }` lines and the two `dependsOn(jvmAndAndroidMain)` lines (these source sets are now empty). The `-Xexpect-actual-classes` compiler arg can be left in place; it's still used by `:argus-core`'s `CorrelationThreadLocal`.
5. Run `./gradlew :argus-server-core:compileKotlinJvm :argus-server-core:compileKotlinIosX64 :argus-server-core:linkPodDebugFrameworkIosSimulatorArm64 :argus-server-core:jvmTest` to confirm the collapse compiles and existing tests still pass.

### Task 3 — Move `ArgusConfigBuilder` from `:argus-android` to `:argus-server-core/commonMain`

1. Move the file to `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfigBuilder.kt`. Change the package to `com.lynxal.argus.server` (currently `com.lynxal.argus.android`).
2. Update `argus-android/.../Argus.kt` import to `com.lynxal.argus.server.ArgusConfigBuilder`.
3. Add `argus-android/src/androidUnitTest/.../ArgusConfigBuilderTest.kt` import update (test currently lives in `argus-android`; can stay there or move to `argus-server-core/commonTest`. Prefer keeping in `argus-android` to minimize churn — test only needs an import bump.)
4. Run `./gradlew :argus-android:test` and `:argus-server-core:jvmTest` to confirm.

### Task 4 — Create `:argus-ios` module

1. Create `argus-ios/build.gradle.kts` mirroring `:argus-server-core`'s shape but iOS-only. `kotlin { listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { it.binaries.framework { baseName = "argus-ios"; isStatic = useStaticFramework } }; sourceSets { iosMain.dependencies { api(projects.argusCore); api(projects.argusServerCore); implementation(libs.kotlinx.coroutines.core); implementation(libs.sqldelight.native.driver) } } }`. Apply `vanniktechMavenPublish` with coordinates `com.lynxal.argus:argus-ios:0.0.1`.
2. Add `sqldelight-native-driver = { group = "app.cash.sqldelight", name = "native-driver", version.ref = "sqldelight" }` to `gradle/libs.versions.toml`.
3. Implement files listed under *New* above. Reuse existing API contracts from `:argus-android`:
   - `Argus.start(configure)` signature returns `ArgusHandle`. Internally constructs `AppInfo`, `ArgusConfig`, `Uuid.random()` session id, picks `SqlDelightEventStore(IosArgusDriverFactory())` when `config.persist`, else `NoopEventStore`, launches `server.start()` on `Dispatchers.IO`. Use `import kotlinx.coroutines.IO` per project memory `feedback_dispatchers_io_native.md`.
   - `LocalIp.firstIPv4()` uses `getifaddrs`/`freeifaddrs` from `platform.posix` and `inet_ntop` to format IPv4 addresses; filter to `AF_INET`, `IFF_UP & ~IFF_LOOPBACK`, RFC1918 ranges (`10/8`, `172.16/12`, `192.168/16`). Mirrors Android's `isSiteLocalAddress` predicate.
   - `IosArgusDriverFactory.create()` returns `NativeSqliteDriver(ArgusDatabase.Schema, name = "argus.db")`. The driver places the DB in the iOS sandbox automatically.
4. `argus-ios/src/iosTest/kotlin/.../AppInfoBuilderTest.kt` — minimal smoke test mirroring `argus-android`'s.
5. Add `include(":argus-ios")` to `settings.gradle.kts`.
6. Run `./gradlew :argus-ios:linkPodDebugFrameworkIosSimulatorArm64 :argus-ios:iosSimulatorArm64Test` to verify it compiles and the smoke test passes.

### Task 5 — Create `:sample-ios` module + Xcode project

1. Create `sample-ios/build.gradle.kts`. KMP module, only `iosX64()`, `iosArm64()`, `iosSimulatorArm64()` (no Android target). `baseName = "SampleIos"`, `isStatic = true`. Read `argusEnabled` boolean property; conditionally add `implementation(projects.argusIos)` to `iosMain` deps and select source dir `src/iosArgusEnabledMain` vs `src/iosArgusDisabledMain` for the seam impl.
2. Create the Kotlin source set as listed under *New*. The `SampleViewModel` exposes:
   - `urls: StateFlow<String?>` (Argus listening URL, or null in disabled mode)
   - `fireGet(url: String)` — fires a Ktor `HttpClient.get(url)` on `Dispatchers.IO`.
   - `fireCorrelatedPair(first: String, second: String)` — wraps two `client.get(...)` calls in `withCorrelation { … }` (only available in iosArgusEnabledMain; disabled variant just fires the calls plainly).
   - `emitLog(level: LogLevel)` — same five buttons as Android sample (verbose/debug/info/warning/error).
   - `publishCustom()` — emits one canned `CustomEvent` (Argus enabled) or no-op (disabled).
3. Create `sample-ios/iosApp/iosApp.xcodeproj` modeled on `../KotlinBaseProject/iosApp/iosApp.xcodeproj`. Replace `ComposeApp` references with `SampleIos`. Replace the `MainViewControllerKt.MainViewController()` call site with a SwiftUI screen that consumes the `SampleViewModel` directly (no Compose for iOS). Add a build phase script:
   ```
   cd "$SRCROOT/../.."
   ./gradlew :sample-ios:embedAndSignAppleFrameworkForXcode \
       -PargusEnabled=$([ "$CONFIGURATION" = "Debug" ] && echo true || echo false)
   ```
4. SwiftUI `SampleScreen.swift` lays out:
   - Header `"Argus Sample"` + URL line (selectable text), shown only when `urls` is non-null.
   - Buttons: GET /users/1, GET /posts, GET image, GET failing host, Correlated pair, Emit VERBOSE/DEBUG/INFO/WARN/ERROR log, Emit custom event.
   - **Omitted vs Android:** OkHttp call, HttpURLConnection call (JVM-only engines).
5. Add `include(":sample-ios")` to `settings.gradle.kts`.
6. Open `sample-ios/iosApp/iosApp.xcodeproj` in Xcode, build and run on the iOS simulator with the Debug scheme. Confirm the URL appears, hit each button, open `http://<simulator-ip>:<port>` in a browser on the host Mac and verify events show up.

### Task 6 — `:sample-ios:verifyReleaseHasNoArgus` Gradle gate

1. Register a Gradle task that:
   - Runs `xcodebuild -project sample-ios/iosApp/iosApp.xcodeproj -scheme iosApp -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath build/xcode build` (simulator destination so it works without a signing identity in CI).
   - Locates the produced `iosApp.app/Frameworks/SampleIos.framework/SampleIos` binary.
   - Runs `nm -gU` and `strings` on it.
   - Fails if any of these symbol fragments appear: `com_lynxal_argus`, `kfun:com.lynxal.argus.`, `io.ktor.server.`, `ArgusServer`, `ArgusEventBus`. Whitelist `com.lynxal.argus.sample.` so the sample's own code is allowed.
   - Same offender-formatting and message style as `sample-android/build.gradle.kts:104-155`.
2. Hook into `:sample-ios:check`.
3. Verify locally: `./gradlew :sample-ios:verifyReleaseHasNoArgus` — must pass with the sample as written. Then temporarily flip `-PargusEnabled=true` in the Release branch of the build phase script and re-run; the gate must fail. Revert.

### Task 7 — README + product docs

1. `README.md`: add § 5 *Installation — iOS* (renumber subsequent sections). Mirror § 4 *Installation — Android* structure:
   - Step 1: add the dependency, debug-only — show podspec / SPM / direct framework example consistent with the chosen Xcode integration (single XCFramework, configuration-driven `argusEnabled` Gradle property).
   - Step 2: define the seam in `iosMain/`.
   - Step 3: debug impl (`iosArgusEnabledMain/`).
   - Step 4: release impl (`iosArgusDisabledMain/`) with the no-import invariant comment.
   - Step 5: Xcode build phase script + the configuration property.
   - Step 6: optional CI gate referencing `:sample-ios:verifyReleaseHasNoArgus`.
   Each block copy-pasted from `:sample-ios` (parallel to how Android references `:sample-android`).
2. Update *§ 2 Status* to mark iOS as shipped (KMP-ready → KMP-shipping). Bump the version line if the release coincides with a new version.
3. `agent-os/product/roadmap.md`: mark *Phase 4: iOS / KMP completion* complete with a date.
4. `agent-os/product/tech-stack.md`: in the *Module Matrix*, remove "Phase 4." from the `:argus-ios` row. In the *Server-Core (KMP)* paragraph, replace the three-bullet expect/actual statement with: *"Server engine is plain Ktor CIO in `commonMain`; no expect/actual is required because `io.ktor.server.cio` is multiplatform."*

## Verification

End-to-end checks, in order:

1. **Unit + lint:** `./gradlew check` from repo root. Must pass (`:sample-android:verifyReleaseHasNoArgus` and `:sample-ios:verifyReleaseHasNoArgus` both run as part of `check`).
2. **iOS framework links:** `./gradlew :argus-ios:linkPodDebugFrameworkIosSimulatorArm64` and `:argus-ios:linkPodReleaseFrameworkIosArm64`.
3. **Sample iOS Debug, end-to-end:** open `sample-ios/iosApp/iosApp.xcodeproj` in Xcode, run on iPhone Simulator with the Debug scheme. Tap each button. On the host Mac, browse to `http://<ip>:<port>` from the URL line and confirm:
   - HTTP requests for `/users/1`, `/posts`, image, failing host appear with Ktor-engine pill (the engine pill PR landed in commit 6a03afa).
   - Correlated pair: two HTTP requests share a correlation id; the three log entries between them share that id.
   - Five log levels appear with the expected level pill.
   - Custom event appears with the source/label set in the sample.
   - The header / app info row shows the iOS bundle id, `CFBundleShortVersionString`, and `<UIDevice.model> <systemVersion>`.
4. **Sample iOS Release, gate proves contract:** `./gradlew :sample-ios:verifyReleaseHasNoArgus` passes. Flip the build-phase script to `argusEnabled=true` for Release and re-run — the gate must fail with the offender list. Revert.
5. **Persistence:** in the Debug scheme, set `Argus.start { persist = true }` in `DebugToolsImpl`. Run, fire a few events, force-quit, relaunch. Open the inspector and confirm previous-session events seed the buffer (matches Android behavior backed by `SqlDelightEventStore.previousSessionEvents`).
6. **Android regression:** `./gradlew :sample-android:assembleDebug :sample-android:verifyReleaseHasNoArgus :argus-android:test` — the `ArgusConfigBuilder` move and the `ArgusServer` collapse must not break Android.

## Standards Applied

- `agent-os/standards/kmp/expect-actual-conventions.md` — *Prefer expect fun over expect class when no platform-specific state is needed* and *Keep expect declarations minimal*. Justifies collapsing `ArgusServer` to a `commonMain` class.
- `agent-os/standards/kmp/module-build-conventions.md` — iOS framework block, `useStaticFramework` toggle, `baseName` matches module name. Used for `:argus-ios` and `:sample-ios` Gradle config.
- `agent-os/standards/kmp/module-boundaries.md` — one-way deps. `:argus-ios` depends on `:argus-server-core` + `:argus-core`; `:sample-ios` debug variant depends on `:argus-ios`.
- `agent-os/standards/persistence/sqldelight-conventions.md` — *platform expect/actual drivers*. `IosArgusDriverFactory` mirrors the Android pattern.
- `agent-os/standards/platform/init-and-di.md` — iOS init is *Manual initialization from Swift with pre/post hooks*. The sample app's `iOSApp.init()` is the call site.
- `agent-os/standards/workflow/commit-conventions.md` — feat/refactor/docs prefixes; no AI attribution trailer (also recorded in `feedback_no_ai_attribution.md`).

## Shape notes (for `shape.md`)

**Decisions captured:**
- Server actual collapses to `commonMain` (option 4) — eliminates duplication and aligns with the *Prefer fewer expect/actual* standard.
- `ArgusConfigBuilder` moves from `:argus-android` to `:argus-server-core/commonMain` to avoid drift between Android and iOS facades.
- iOS persistence is shipped in v1, not deferred.
- Release gate uses `xcodebuild archive -configuration Release` + `nm`/`strings` symbol scan, hooked into `check`.
- Sample omits OkHttp and HttpURLConnection demo buttons (engines are JVM-only).
- No Compose Multiplatform on iOS for the sample — SwiftUI is sufficient for one screen.

**Risks called out:**
- The `argusEnabled` Gradle property must drive both source-set selection and dependency wiring for `:sample-ios`. If they get out of sync, the release variant could compile but link `:argus-ios`. The `verifyReleaseHasNoArgus` gate is what catches that.
- iOS framework size: `:argus-ios` pulls Ktor server CIO + SQLDelight native driver. Acceptable for a debug-only artifact, but worth checking the framework size after the first build and noting in the README.
- `getifaddrs` cinterop is in `platform.posix` for Kotlin/Native — no custom `.def` file needed (unlike `kmp/ios-cinterop` which describes Swift bridge cases). Confirm at implementation time that the `cValue<sockaddr_in>` casting is straightforward; if not, fall back to `Network.framework` via Objective-C interop.
