# Product Roadmap

## Phase 1: MVP

Ship an on-device Ktor + log inspector that a Lynxal engineer can wire into a Canvas Control Android app, discover from a laptop browser on the same LAN, and use to debug real device traffic.

**Core capture:**
- Ktor `HttpClient` plugin capturing full request/response metadata and bodies.
- KMMLogging delegate capturing application log events.
- Custom event type scaffolded in the data model (full support lands in Phase 3).

**Unified timeline:**
- HTTP and Log events interleaved in a single chronological stream.
- Source badges distinguish event types at a glance.
- Simple waterfall view (phased waterfall is a non-goal for MVP).
- Request / log correlation via time-window heuristic (proper correlation ships in Phase 2).

**On-device server + UI:**
- Embedded Ktor server exposing a REST API and WebSocket stream.
- Static SPA bundled as byte arrays inside the `:argus-webui-bundle` KMP module and served by the device itself.
- `:argus-android` module wires everything together for Android hosts.

**Discovery:**
- mDNS/DNS-SD advertisement via the existing `:lantern-android` module.
- Any browser on the same LAN can discover the device and open the inspector (one device per browser tab).

**Distribution model:**
- Debug-only: consumers use `debugImplementation` (and optionally a custom `stagingImplementation`). `releaseImplementation` is explicitly unsupported. Release builds contain zero Argus code — there is no no-op module by design.

**Module layout (v1):**
- `:argus-core` — shared data model, event bus, capture APIs.
- `:argus-webui` — SPA source.
- `:argus-webui-bundle` — KMP module exposing the built SPA as byte arrays.
- `:argus-server-core` — embedded Ktor server, REST + WebSocket.
- `:argus-android` — Android host integration, lantern wiring.

**Explicit non-goals for v1:**
- Chrome DevTools Protocol compatibility.
- A no-op release module (rejected — release builds have no Argus dependency at all).
- OkHttp, HttpURLConnection, and Retrofit hooks.
- SQLite, SharedPreferences, and view-hierarchy inspection.
- HTTPS proxy mode.
- Request replay, blocking, throttling, breakpoints.
- WebSocket frame inspection.
- Multi-device inspection in a single browser tab.
- Persistence across app restarts.
- Full-body download for truncated bodies.
- Phased waterfall rendering.
- Exact request/log correlation (time-window heuristic only).

## Phase 2: Post-Launch

**Correlation & persistence:**
- Proper request ↔ log correlation (propagate correlation IDs through MDC-equivalent context rather than relying on time-window heuristics).
- Session persistence across app restarts so a crash doesn't erase the timeline.
- Full-body download for responses that were truncated during capture.

**Timeline polish:**
- Phased waterfall (DNS / connect / TLS / send / wait / receive breakdown).
- WebSocket frame inspection on captured Ktor WebSocket sessions.

## Phase 3: Ecosystem expansion

**Additional HTTP clients:**
- OkHttp interceptor.
- HttpURLConnection hook.
- Retrofit convenience wiring.

**Custom events:**
- Promote the scaffolded Custom event type to a first-class, documented public API for application-defined timeline entries.

**Inspector features (candidate, not committed):**
- Request replay, blocking, throttling, breakpoints.
- SQLite / SharedPreferences / DataStore inspection.
- View-hierarchy inspection.

## Phase 4: iOS / KMP completion — shipped 2026-04-30

- ✅ `:argus-ios` module — native iOS host integration. Mirrors `:argus-android`'s facade pattern (`Argus.start { … }`, `ArgusHandle`, `AppInfoBuilder` via `NSBundle`/`UIDevice`, `LocalIp` via `getifaddrs`, `IosArgusDriverFactory` wrapping SqlDelight `NativeSqliteDriver`).
- ✅ Validated `:argus-core`, `:argus-webui-bundle`, and `:argus-server-core` end-to-end on iOS. The `expect class ArgusServer` was collapsed to a single `commonMain` class because the actuals were byte-identical and `io.ktor.server.cio` is multiplatform.
- ✅ Parity of Ktor client plugin + KMMLogging delegate on iOS targets.
- ✅ Sample app unified — `:sample-android` and `:sample-ios` collapsed into a single `:sample` KMP module that produces both the Android APK and the iOS framework. Compose Multiplatform renders the shared UI on both platforms; the iOS app uses `ComposeUIViewController` to embed the Compose UI in SwiftUI. OkHttp and HttpURLConnection demos remain Android-only (engines are JVM-only). Debug-only contract enforced by `:sample:verifyReleaseHasNoArgus` (Android: dexdump APK) and `:sample:verifyIosReleaseHasNoArgus` (iOS: xcodebuild Release + `nm`/`strings` symbol scan).
