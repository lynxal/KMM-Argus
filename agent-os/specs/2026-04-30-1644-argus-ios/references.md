# References for argus-ios

## Similar Implementations in this Repo

### `:argus-android` — host facade template

- **Location:** `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/`
- **Relevance:** `:argus-ios` mirrors this module's role (thin facade over `:argus-server-core`).
- **Key files to mirror in `:argus-ios`:**
  - `Argus.kt` — public `start()` entry point. iOS will be parameter-less (no `Context`).
  - `ArgusHandle.kt` — `eventBus` + `url: StateFlow<String?>` + `stop()`. iOS uses `NSLog` instead of `android.util.Log`.
  - `AppInfoBuilder.kt` — `pkg`/`versionName`/`device` from platform APIs. iOS uses `NSBundle.mainBundle` and `UIDevice.currentDevice`.
  - `LocalIp.kt` — first IPv4 site-local address. Android uses `NetworkInterface`; iOS uses POSIX `getifaddrs` via `platform.posix`.
  - `db/AndroidArgusDriverFactory.kt` — SqlDelight driver. iOS replaces `AndroidSqliteDriver` with `NativeSqliteDriver`.
  - `ArgusConfigBuilder.kt` — about to be moved to `:argus-server-core/commonMain` so both facades share it.

### `:sample-android` — debug-seam contract template

- **Location:** `sample-android/src/`
- **Relevance:** `:sample-ios` mirrors the seam pattern.
- **Key files / patterns to mirror:**
  - `androidMain/.../debug/DebugTools.kt` — interface, imports nothing from `com.lynxal.argus.*`. iOS equivalent goes in `commonMain/`.
  - `androidDebug/.../DebugToolsImpl.kt` — real impl wiring Argus + Ktor + log delegate. iOS analog: `iosArgusEnabledMain/.../DebugToolsImpl.kt`.
  - `androidRelease/.../DebugToolsImpl.kt` — no-op impl with the *"Invariant: this file must not import anything from com.lynxal.argus.*"* header comment. iOS analog: `iosArgusDisabledMain/.../DebugToolsImpl.kt`.
  - `commonMain/.../ui/SampleScreen.kt` — Compose UI listing the demo buttons. iOS uses SwiftUI on the Swift side; the same set of buttons is exposed via a `SampleViewModel` in Kotlin `commonMain/`.
  - `build.gradle.kts:104-155` — `verifyReleaseHasNoArgus` Gradle task. iOS analog scans the iOS framework binary instead of dexdump'ing an APK.

## Reference External Project

### `KotlinBaseProject` — KMP iOS app layout reference

- **Location:** `../KotlinBaseProject/` (sibling of this repo)
- **Relevance:** Provides a working KMP iOS Xcode-project template. Used as a structural reference, not for version parity.
- **Key files to study:**
  - `composeApp/build.gradle.kts` — KMP iOS targets block, framework `baseName`/`isStatic` config.
  - `iosApp/iosApp.xcodeproj/` — Xcode project structure with the build phase script that calls `:composeApp:embedAndSignAppleFrameworkForXcode`.
  - `iosApp/iosApp/iOSApp.swift`, `ContentView.swift` — Swift entry-point pattern (`@main struct App`, `UIViewControllerRepresentable` bridge to Kotlin).
  - `iosApp/Configuration/Config.xcconfig` — Xcode build configuration template.
- **What we adopt:** the project layout, `embedAndSignAppleFrameworkForXcode` integration, and the build-phase script idiom.
- **What we change:** SwiftUI directly (no Compose Multiplatform), Kotlin/Compose/AGP versions stay on Argus's existing baseline, and the build phase script also passes `-PargusEnabled` driven by `$CONFIGURATION`.

## Internal commits worth noting

- `aeebc34` — added `:argus-okhttp` and `:argus-urlconnection` engine modules (JVM-only; explains why `:sample-ios` skips those buttons).
- `6a03afa` — engine pill on HTTP rows in the web UI; useful when verifying iOS Ktor capture during the end-to-end test.
- `0cfa57f` — `ArgusEventBus.publishCustom` extension; used by the iOS sample's *Emit custom event* button.
- `917e82a` — `CustomEvent.sourceLabel` filter; `:sample-ios` uses the same source-label convention.
