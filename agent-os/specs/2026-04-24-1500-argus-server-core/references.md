# References for `:argus-server-core`

## Similar Implementations

### `:argus-core` event model

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`
- **Relevance:** Every type this module serializes, fans out, and filters is defined here. `ArgusEvent`, `HttpEvent`, `LogEvent`, `CustomEvent`, `Header`, `EventSource`, `HelloPayload`, `ARGUS_SCHEMA_VERSION`.
- **Key patterns to borrow:**
  - Polymorphic JSON envelope via `@SerialName` + `classDiscriminator = "type"` on `ArgusEvent` — the `OutboundMessage`/`InboundMessage` WS envelopes mirror this exactly.
  - `@Serializable public data class` shape — kotlinx.serialization everywhere.
  - Nullable fields for backward compatibility (`HelloPayload.serverVersion`) — `HelloPayload.appInfo` will follow the same pattern.

### `:argus-core` client plugin + logging delegate

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt`, `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerConfig.kt`
- **Relevance:** Both consume an `ArgusEventBus`. This module provides the concrete implementation (`ChannelEventBus`) that they will publish into when wired via `server.eventBus`.
- **Key pattern to borrow:** `DEFAULT_REDACT_HEADERS` (line 16 of `ArgusClientConfig.kt`) is the single source of truth; this module re-exports it under the spec-mandated name `DEFAULT_REDACTED_HEADERS` rather than duplicating the list.

### `:argus-webui-bundle`

- **Location:** `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/ArgusUiBundle.kt` (line 24)
- **Relevance:** The `ArgusUiBundle.get(path)` method already handles SPA fallback for trailing-slash and extensionless paths. The server's UI route simply calls it; no logic duplication required.
- **Key pattern to borrow:** Null-returning contract for missing files-with-extensions lets the server emit `404` for `/missing-asset.png` while falling through to `/index.html` for SPA routes.

### `:argus-webui-bundle` build configuration

- **Location:** `argus-webui-bundle/build.gradle.kts`
- **Relevance:** Already uses the `jvmAndAndroidMain` intermediate source set pattern (lines 37-39) that this spec mirrors for the `ArgusServer` actual:
  ```kotlin
  val jvmAndAndroidMain by creating { dependsOn(commonMain) }
  getByName("jvmMain").dependsOn(jvmAndAndroidMain)
  getByName("androidMain").dependsOn(jvmAndAndroidMain)
  ```
- **Key pattern to borrow:** `kotlin.io.encoding.Base64.Default` with call-site `@OptIn(ExperimentalEncodingApi::class)` (line 117 of `BundleEntry.kt`) — the body-bytes route uses the same API for base64 decoding without requiring a global opt-in.

### `:argus-core` build configuration

- **Location:** `argus-core/build.gradle.kts`
- **Relevance:** Baseline KMP build template (plugins, targets, Android block, compileSdk/minSdk from catalog, JVM 17 toolchain, `-opt-in=kotlin.time.ExperimentalTime`) that `:argus-server-core` mirrors.

### `:argus-core` test conventions

- **Location:** `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/EventFactories.kt`, `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/RecordingEventBus.kt`
- **Relevance:** Existing `createTest*()` factory functions for `ArgusEvent` subtypes — reused verbatim in the new `ServerTestFactories.kt` and in the jvmTest `RoutesTest`/`WsTest` fixtures.
- **Key pattern to borrow:** Test doubles implementing the domain interface (`RecordingEventBus : ArgusEventBus`) rather than mocks. No mokkery; no mocking framework anywhere in this repo's tests today.

## Product / spec precedents

### Phase 1 roadmap

- **Location:** `agent-os/product/roadmap.md` (Phase 1 section)
- **Relevance:** "Embedded Ktor server exposing a REST API and WebSocket stream" is the exact line item this spec executes. Non-goals for v1 (WebSocket frame inspection, request replay/block/throttle, session persistence, full-body download, phased waterfall) are honored — this spec adds none of them.

### Tech-stack module matrix

- **Location:** `agent-os/product/tech-stack.md` lines 49-58 (`:argus-server-core` row)
- **Relevance:** Declares `expect class ArgusServer`, dependency on `:argus-core` + `:argus-webui-bundle`, routing-in-commonMain principle. This spec honors all of these. The one deliberate divergence — actuals colocated in `:argus-server-core` rather than split into `:argus-android` / `:argus-ios` — is documented in `shape.md`.

### Previous spec (immediate predecessor)

- **Location:** `agent-os/specs/2026-04-24-1030-argus-webui-bundle/plan.md`
- **Relevance:** Closing line 219 of that plan: "Future `:argus-server-core` will consume via `implementation(projects.argusWebuiBundle)` from its `commonMain` and route via `ArgusUiBundle.get(call.request.path())`." This spec picks up from there exactly.
