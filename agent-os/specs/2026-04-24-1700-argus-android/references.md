# References for `:argus-android`

## Similar Implementations

### `:argus-server-core` `ArgusServer` actual

- **Location:** `argus-server-core/src/jvmAndAndroidMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`
- **Relevance:** The type the facade wraps. Confirms `eventBus` is property-initialised in the constructor (line 16), so callers can wire it into Ktor/Logger before `start()` completes. Confirms `boundPort` is `@Volatile` + throw-if-unset, which is why the handle exposes the URL as a `StateFlow<String?>` rather than a direct getter.
- **Key pattern borrowed:** Explicit `start()` / `stop()` contract, module-owned engine lifecycle.

### `:argus-core` Ktor client plugin

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt`
- **Relevance:** Source of the `Argus` name clash — `public val Argus: ClientPlugin<ArgusClientConfig>` here collides with `public object Argus` in this spec. Mitigated at the sample call site with `import ... .ktor.Argus as ArgusPlugin`.
- **Key pattern borrowed:** `install(Argus) { eventBus = … }` DSL shape stays identical from the consumer's perspective.

### `:argus-core` logging delegate

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt`
- **Relevance:** Already accepts `ArgusEventBus` in its constructor. The sample wires `ArgusLoggerDelegate(handle.eventBus)` alongside `DebugLoggerImplementation()` on the KMMLogging `Logger`.

### `:argus-core` AppInfo + DEFAULT_REDACT_HEADERS

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/AppInfo.kt`, `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt:16`
- **Relevance:** `AppInfo` is the exact shape produced by `AppInfoBuilder.from(context)`. `DEFAULT_REDACT_HEADERS` is re-exported from `:argus-server-core` as `DEFAULT_REDACTED_HEADERS` — the builder uses it as its default.

### `:argus-core` build configuration

- **Location:** `argus-core/build.gradle.kts`
- **Relevance:** Baseline Android-target KMP library template (plugins, source sets, Android block, JVM 17 toolchain, `-opt-in=kotlin.time.ExperimentalTime`) that `:argus-android` mirrors minus the JVM/iOS targets.

### `:sample-android` existing debug/release split

- **Location:**
  - `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
  - `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
  - `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt`
- **Relevance:** The variant-specific `DebugToolsImpl` pattern is already in place. This spec rewrites the debug impl, updates the release impl for the interface change, and deletes the scaffold files (`ConsoleEventBus.kt`, `EventLogBuffer.kt`). The invariant comment on the release variant is preserved verbatim.
- **Key pattern borrowed:** One file per variant, interface shared from `androidMain/`.

### Lantern Android library (evaluated, not used)

- **Location:** `com.lynxal.lantern:lantern-android:0.0.1` — https://github.com/lynxal/lantern_android
- **Relevance:** Planned dependency for mDNS in the user's literal spec. README is explicit: "No service registration — Lantern is discovery-only. Registration is handled by the advertiser side." Can't satisfy the "register on start, unregister on stop" requirement. Combined with the user's direction to "skip discovery for now", the dependency and related acceptance criteria (`dns-sd -B _argus._tcp`, Wi-Fi re-register) are dropped.

## Product / spec precedents

### Phase 1 roadmap

- **Location:** `agent-os/product/roadmap.md` (Phase 1 section)
- **Relevance:** This module is the fifth of Phase 1's six module deliverables. Non-goals for v1 (phase 2 correlation IDs, full-body download, request replay) are honored.

### Product mission

- **Location:** `agent-os/product/mission.md` line 29
- **Relevance:** Describes mDNS discovery via `:lantern-android` as the target. That part is deferred pending a registration-capable lantern release; the module ships now without it.

### Immediate-predecessor spec

- **Location:** `agent-os/specs/2026-04-24-1500-argus-server-core/`
- **Relevance:** Folder layout, shape.md / references.md / standards.md / plan.md conventions mirrored exactly. Its decision #3 ("All `ArgusServer` actuals live inside `:argus-server-core`") is the direct predecessor of this spec's decision #2.

### `:sample-android` spec

- **Location:** `agent-os/specs/2026-04-23-1852-sample-android/plan.md`
- **Relevance:** Established the variant-split `DebugToolsImpl` pattern and the `ConsoleEventBus` scaffold that this spec retires.
