# Argus — Implementation Audit Specification

**Project:** Argus
**Owner:** Lynxal
**Audience:** External or internal reviewer validating implementation quality and completeness
**Document version:** 1.0
**Status:** Pre-implementation specification

---

## 1. Purpose of this document

This document gives a reviewer the complete picture of what Argus is, what it must do, what it must not do, how it should behave, and what evidence demonstrates correct implementation. It is the contract against which the delivered codebase will be measured.

The reviewer is expected to:
- Read the codebase, build the artifacts, and run the sample app
- Verify each requirement in section 6 ("Verification checklist") is met
- Flag any deviations, ambiguities, or quality issues
- Validate that the architectural constraints in sections 3 and 4 are not violated

---

## 2. Product summary

Argus is an on-device HTTP and application-log inspector for Kotlin Multiplatform Mobile apps and IoT gateways. Built at Lynxal as a Kotlin-first, Ktor-native replacement for Stetho.

A debug build of a consumer app embeds a Ktor server inside itself. The server captures outbound HTTP traffic via a Ktor HttpClient plugin and application logs via a KMMLogging delegate, then serves a single-page web UI that engineers open in a desktop browser to inspect live traffic from their device.

Release builds of consumer apps contain zero Argus code. This is enforced architecturally and verified by CI.

**Target users:** Lynxal Android and Kotlin engineers; Canvas Hub firmware engineers; QA inspecting real-device traffic.

**Primary use case:** debugging cloud, mesh, and local API calls from Canvas Control mobile apps and Canvas Hub IoT gateways during development and pre-release testing on customer LANs.

---

## 3. Non-negotiable architectural constraints

These constraints define the system. Violating any of them is a failure of the implementation, not a trade-off.

### 3.1 Debug-only distribution
- Argus library artifacts must only be added to consumer apps as `debugImplementation` (or a project-defined `stagingImplementation`).
- Release builds of consumer apps must contain zero classes from any `com.lynxal.argus.*` package.
- This is enforced via a CI check using `apkanalyzer dex packages` against the sample app's release APK. The check must fail the build if any Argus class is detected.
- There is no no-op module. The pattern relies on Gradle source-set splits (`src/debug/`, `src/release/`) and a consumer-side interface seam in `src/main/` that has no Argus imports.

### 3.2 No Chrome DevTools Protocol
- The system does not implement, mimic, or partially implement CDP.
- The on-device server protocol is custom (REST + WebSocket, JSON frames).
- The UI is a custom SPA, not a vendored or pinned `devtools-frontend`.

### 3.3 KMP-first capture, platform-thin shells
- All capture-side code (Ktor client plugin, KMMLogging delegate, event model, event bus interface) lives in `:argus-core`'s `commonMain` and runs unchanged on JVM, Android, and iOS targets.
- Server routing, ring buffer, and query/filter logic live in `:argus-server-core`'s `commonMain`. Ktor's CIO engine is multiplatform (JVM, Android, iOS), so `ArgusServer` itself lives in `commonMain` as a plain class — no `expect/actual` split is needed for binding or lifecycle.
- Web UI bundle is generated as KMP byte-array constants (`:argus-webui-bundle`) so both Android and iOS server modules serve identical assets.

### 3.4 Ktor client first
- The MVP HTTP capture path is via a Ktor `HttpClient` plugin (`createClientPlugin`).
- OkHttp and HttpURLConnection support ship as separate engine modules (`:argus-okhttp`, `:argus-urlconnection`) that bridge to the same `ArgusEventBus` contract; Retrofit is consumed transparently by reusing those engines.
- No reflection, no agent-based bytecode rewriting, no per-engine adapters in the MVP.

### 3.5 KMMLogging integration as the v1 log source
- Log capture in MVP is exclusively through a `LoggerInterface` delegate registered with the existing `com.lynxal.logging:logging` library.
- The delegate maps KMMLogging levels, tags, payload, and cause chain into the `LogEvent` schema.
- No alternative log integrations in MVP.

### 3.6 Streaming-safe HTTP capture
- The Ktor client plugin must never consume the original request or response channel. Streaming clients must continue to receive bytes uninterrupted.
- Body capture is implemented via channel teeing (`ByteChannel` split or equivalent) up to a configurable cap. On overflow, capture stops; the original consumer continues unaffected.

### 3.7 Transparent body redaction
- Header redaction is case-insensitive, applied symmetrically to request and response.
- Default redacted headers: `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`.
- Redacted values are replaced with `***redacted***` in captured events. The header model carries a `redacted: Boolean` flag so the UI can style accordingly.

### 3.8 No mDNS discovery in MVP
- Device discovery via mDNS / DNS-SD / Bonjour is explicitly out of scope.
- The sample app and any consumer must surface the listening URL via logcat (`Argus listening on http://<host>:<port>`) and/or in their own UI.
- No `_argus._tcp` advertisement, no Lantern integration, no `NetworkCallback` for service re-registration.

### 3.9 Design before implementation
- The web UI implementation in `argus-webui/` derives from design artifacts in `design_handoff_argus_inspector/`, the design source of truth (JSX prototypes per component, CSS token export, handoff README).
- The implementation consumes these: `argus-webui/src/design/tokens.json` mirrors the handoff tokens, and Tailwind config is generated from `tokens.json`. No hand-picked colors or spacing values are permitted in the implementation.

### 3.10 Bundle and footprint budgets
- Web UI: total gzipped bundle < 100 KB.
- Web UI fonts and icons: bundled at build time, not loaded from a CDN at runtime.
- `:argus-android` aar < 2.5 MB.
- `:argus-webui-bundle` generated Kotlin source < 300 KB for typical MVP bundle.

---

## 4. Module structure and dependency graph

```
argus-core (KMP: jvm, android, ios)
    └─ Ktor client plugin, KMMLogging delegate, event model, ArgusEventBus interface

argus-webui (TypeScript / Vite / Tailwind, npm project, no Kotlin)
    └─ SPA implementation; npm build produces dist/

argus-webui-bundle (KMP: jvm, android, ios)
    └─ Gradle task generates byte-array constants from argus-webui/dist/

argus-server-core (KMP: jvm, android, ios)
    └─ Ktor routing, ring buffer, query/filter, ArgusServer (commonMain plain class — CIO is multiplatform)
    └─ Depends on: argus-core, argus-webui-bundle

argus-android (Android-only)
    └─ Public entry point (Argus.start, ArgusHandle); SQLDelight Android driver factory
    └─ Depends on: argus-server-core
    └─ NO dependency on Lantern (mDNS dropped)

argus-ios (iOS-only)
    └─ Public entry point (Argus.start, ArgusHandle); SQLDelight Native driver factory
    └─ Depends on: argus-server-core

sample (KMP application: Android + iOS)
    └─ Reference integration; CI target for the zero-Argus-classes check
    └─ Depends on: argus-android (debugImplementation only) and argus-ios (iosArgusEnabled source set only)
```

Dependency direction is strict and downward only. No reverse dependencies.

---

## 5. Functional requirements (MVP)

### 5.1 Capture — HTTP via Ktor client plugin
- Plugin installable via `install(Argus) { eventBus = ...; maxBodyBytes = ...; redactHeaders = ...; captureRequestBody = ...; captureResponseBody = ... }`.
- Captures: method, full URL (split into host + path), all headers (with redaction), request body (up to cap), response status code and text, response headers, response body (up to cap), start timestamp, duration.
- Captures errors: throwable class, message, full stack trace.
- Default `eventBus` is `NoopEventBus` (zero-cost no-op when not wired to a real bus).
- Body handling per content type: text/* and application/*+json captured as UTF-8 string; image/* and binary captured as base64 up to cap; multipart/* and application/octet-stream captured with cap (truncation marker on overflow).
- Body cap default: 1,000,000 bytes. Overflow produces `bodyTruncatedTotalBytes = <total>` and the captured prefix is preserved.
- Per-request UUID v4 stashed on Ktor request attributes for request/response correlation inside the plugin.

### 5.2 Capture — Logs via KMMLogging delegate
- `ArgusLoggerDelegate(bus, config)` implements KMMLogging's `LoggerInterface`.
- Registered via `Logger.add(...)` in the consumer's debug source set.
- Captures: level (verbose/debug/info/warn/error), tag, message, payload key-value map, throwable cause chain.
- `maxMessageLength` default 10,000 chars (longer messages truncated with `...<+N chars>` marker).
- `maxPayloadEntries` default 50.
- `captureStackTraces` default true; disabling skips stack trace extraction for performance.
- Respects `LogLevel` minimum filter before constructing `LogEvent`.

### 5.3 Event model
- Sealed `ArgusEvent` interface with `HttpEvent`, `LogEvent`, `CustomEvent`.
- All types `@Serializable` via kotlinx.serialization, round-tripping cleanly on JVM and native.
- `EventSource` enum: `HTTP`, `LOG`, `CUSTOM`.
- Schema version constant `ARGUS_SCHEMA_VERSION` exposed; included in WS hello payload.
- `Header` model carries a `redacted: Boolean` flag for UI styling.

### 5.4 Server — REST and WebSocket
Routes:
- `GET /` — `index.html` from `:argus-webui-bundle`
- `GET /{path...}` — static asset by path; SPA fallback to `index.html` for unknown paths
- `GET /api/info` — `{ pkg, versionName, device, argusVersion, schemaVersion }`
- `GET /api/events` — list with query params: `limit`, `before`, `source`, `method`, `statusClass`, `host`, `urlContains`, `logLevel`, `tag`
- `GET /api/events/{id}` — single event
- `GET /api/events/{id}/request-body` — raw bytes
- `GET /api/events/{id}/response-body` — raw bytes
- `DELETE /api/events` — clear all
- `WS /ws` — live stream

WebSocket frames (JSON):
- Server → Client: `{"type":"hello","info":...,"schemaVersion":1}`
- Server → Client: `{"type":"event","event":<ArgusEvent>}`
- Server → Client: `{"type":"cleared"}`
- Client → Server (optional): `{"type":"subscribe","filter":{...}}`

CORS:
- Debug-only allowance for `http://localhost:5173` (Vite dev server) so engineers can iterate on the UI against a real device.
- No CORS in production-style runs.

Auth: none in v1. The README must document the LAN-exposure risk.

### 5.5 Ring buffer
- Combined cap across HTTP, Log, and Custom events. Default 500 events.
- Oldest-evicted-first eviction.
- Single-writer channel with fan-out to REST long-poll consumers and WS clients.
- Sustained throughput target: 500 events/sec combined on a Pixel 6-class device without drops.

### 5.6 Web UI — features
- Top bar with device info, clear, pause/resume, dark mode toggle, connection status indicator
- Virtualized event list (10k+ rows) with source badges (HTTP, LOG, CUSTOM-scaffolded), status colors, hover/selected states, live-append animation, jump-to-latest pill
- Filter bar: source multi-select, HTTP-specific (method, status class), Log-specific (level, tag), universal host search and URL/message contains search with match highlighting
- Event detail — HTTP: tabs Headers | Request | Response | Timing | Related Logs | Raw; Copy as cURL action
- Event detail — LOG: tabs Message | Payload | Stack Trace | Raw
- Event detail — CUSTOM: tabs Payload | Metadata | Raw
- Body viewer states: JSON tree, plain text, image preview, hex view, empty, truncated banner
- Waterfall view: shared time axis, HTTP bars rendered as illustrative Connect/Wait/Download segments (status-class-tinted, fixed weights — they convey duration and status, not real phase timings), Log/Custom tick marks, hover tooltip, click-to-select, zoom and pan
- Split view: list and waterfall stacked with synchronized selection
- Empty states: no events yet, no events match filters, nothing selected
- Connection states: connected, reconnecting, disconnected
- Dark mode: system-follow default with explicit toggle override
- Keyboard shortcuts: `?` (help), `/` (search focus), `f` (filters), `j`/`k` (selection move), `x` (clear filters), `Shift+X` (clear events with toast + ⌘Z undo), `p` (pause toggle), `w` (cycle list/waterfall/split), `[`/`]` (cycle detail tabs), `Esc` (close detail/help)
- Filters apply client-side, instantly
- Search with highlight

### 5.7 Web UI — non-features (explicitly out of MVP)
- HAR export (dropped)
- HAR replay (dropped)
- Request replay
- Request blocking, mocking, throttling
- Breakpoints
- WebSocket frame inspection (the inspected app's outbound WS frames)
- Multi-device in a single browser tab (each tab inspects one device)
- Full-body download for truncated bodies
- Real-phase waterfall driven by actual transport timings (DNS / Connect / TLS / Send / Wait / Receive). The MVP renders illustrative Connect/Wait/Download segments with fixed weights for visual structure — that is permitted.
- Exact request/log correlation (replaced by time-window heuristic in MVP)
- mDNS / Bonjour discovery
- QR codes for device URL

### 5.8 Sample app
- `:sample` is a runnable Android application module included in the repository.
- Provides buttons for: `GET /users/1` (small JSON), `GET /posts` (larger JSON list), `GET image` (binary), `GET failing host` (network error), and one button per KMMLogging level emitting a log with payload (the ERROR button includes a synthetic throwable chain).
- The sample app's UI displays the Argus listening URL (`http://<host>:<port>`) on start.
- Logcat prints `Argus listening on http://<host>:<port>` at INFO level on server start.
- Build variants: `debug` (Argus enabled), `release` (Argus excluded).
- Implements the canonical interface seam pattern (`DebugTools` interface in `src/main/`, `DebugToolsImpl` in `src/debug/` and `src/release/`) that the README documents.
- Release variant has zero Argus imports in `src/release/`.

### 5.9 Documentation
- `README.md` at repo root with a prominent warning callout on debug-only distribution, full integration steps with code samples copy-pasted verbatim from the sample app, configuration reference, troubleshooting section, architecture overview.
- A new developer following only the README must be able to integrate Argus into a fresh Canvas-style app in under 30 minutes.

---

## 6. Verification checklist

The reviewer validates each item below against the delivered codebase. Each item is binary: pass or fail. Failures should be documented with file/line references.

### 6.1 Architectural compliance
- [ ] No module under `:argus-*` depends on `:lantern-android` or any other mDNS library
- [ ] `:argus-core` `commonMain` compiles for jvm, android, and ios targets
- [ ] `:argus-server-core` `commonMain` contains the routing logic and `ArgusServer` itself (plain class — Ktor CIO is multiplatform, so no `expect/actual` split is required)
- [ ] No CDP (Chrome DevTools Protocol) types, message names, or domains appear in the codebase
- [ ] The web UI is custom-built from `design_handoff_argus_inspector/` artifacts; `devtools-frontend` is not vendored
- [ ] `:argus-webui-bundle` generates byte-array constants and is consumed by `:argus-server-core`
- [ ] No no-op module exists in the repository

### 6.2 Capture correctness
- [ ] Ktor client plugin captures all listed fields for successful GETs in the sample app
- [ ] Ktor client plugin captures errors (failing-host button produces an HttpEvent with `error` populated)
- [ ] Body capture respects `maxBodyBytes`; oversized bodies produce truncation marker without breaking the original consumer
- [ ] Streaming uploads (multipart) capture with cap; original upload completes successfully
- [ ] Header redaction applies symmetrically; default redacted headers are stripped; `Header.redacted = true` flag is set
- [ ] KMMLogging delegate captures all five levels with payload and throwable chain
- [ ] Throwable cause chain is recursed; `cause` field is populated when a chained exception is logged
- [ ] `NoopEventBus` is the default; plugin and delegate compile and run with no observable side effects when no real bus is wired

### 6.3 Distribution and CI
- [ ] `:sample` `app/build.gradle.kts` shows `debugImplementation` only (no `implementation` or `releaseImplementation` of any Argus artifact)
- [ ] `src/main/` of the sample app contains the `DebugTools` interface with no Argus imports
- [ ] `src/debug/` of the sample app contains a `DebugToolsImpl` that installs the Ktor plugin and KMMLogging delegate
- [ ] `src/release/` of the sample app contains a `DebugToolsImpl` with zero Argus imports
- [ ] `./gradlew :sample:assembleRelease` succeeds
- [ ] `apkanalyzer dex packages` of the release APK produces no `com.lynxal.argus.*` matches
- [ ] CI pipeline includes a `verifyReleaseHasNoArgus` step that fails if Argus classes appear in the release APK

### 6.4 Server behavior
- [ ] Server binds a free port and exposes it (`boundPort` property)
- [ ] `GET /api/info` returns the documented JSON shape with correct schema version
- [ ] `GET /api/events` returns events; query parameters filter correctly
- [ ] `GET /api/events/{id}/response-body` returns raw bytes with correct Content-Type
- [ ] `DELETE /api/events` clears the buffer and broadcasts `{"type":"cleared"}` over WS
- [ ] WS connection receives `hello` frame on connect and `event` frames as new events arrive
- [ ] WS reconnect resumes cleanly without duplicate event delivery (verify by id)
- [ ] CORS allows `http://localhost:5173` in debug builds; rejects other origins
- [ ] Server gracefully releases the port on `stop()`

### 6.5 Ring buffer
- [ ] Buffer evicts oldest events when capacity is exceeded
- [ ] Capacity is configurable via `ArgusConfig`
- [ ] Sustained 500 req/s + 500 log/s combined produces no drops in a benchmark on a mid-tier Android device

### 6.6 Web UI compliance with design
- [ ] Design artifacts are present at `design_handoff_argus_inspector/` (JSX prototypes, CSS token export, handoff README)
- [ ] `tailwind.config.ts` is generated or hand-mirrored from `argus-webui/src/design/tokens.json` with no extra hand-picked values
- [ ] Searching the codebase for hex color literals or px values outside of the Tailwind config returns zero matches
- [ ] Every component listed in `design_handoff_argus_inspector/argus/*.jsx` has a corresponding implementation under `argus-webui/src/components/`
- [ ] Every screen state from the JSX prototypes renders correctly in the running app
- [ ] Empty, loading, and error states are implemented for every view that can produce them
- [ ] Keyboard shortcuts behave per the README walkthrough and the implementation in `argus-webui/src/keyboard/`
- [ ] `prefers-reduced-motion` is respected; transition durations come from `tokens.json`

### 6.7 Web UI runtime quality
- [ ] Production gzipped bundle size is under 100 KB
- [ ] Lighthouse performance score above 95 in light and dark modes
- [ ] Event list with 10,000 events scrolls without dropped frames (use Chrome DevTools performance recording)
- [ ] Waterfall view with 1,000 events renders under 100 ms (measured)
- [ ] Filter changes apply visibly within one frame (no spinner, no API round-trip)
- [ ] Body search with highlight across 500 captured events completes under 50 ms
- [ ] No external network requests at runtime (verified by browser DevTools network tab — only requests should be to the device's own server)

### 6.8 Sample app
- [ ] App launches on emulator and a physical device with `./gradlew :sample:installDebug`
- [ ] Each GET button produces a captured event visible at `<host>:<port>` REST API
- [ ] Failing-host button produces an event with `error` populated
- [ ] Each log button produces a `LogEvent` at the corresponding level
- [ ] ERROR log button's event includes throwable info with non-null `stackTrace`
- [ ] App's UI displays the Argus URL on start
- [ ] Logcat shows `Argus listening on ...` at INFO on app start
- [ ] Release variant builds without Argus on the classpath
- [ ] Release APK launches and the buttons function (without capture) — i.e., the integration seam doesn't leak

### 6.9 Documentation
- [ ] `README.md` exists at repo root
- [ ] Section warning on debug-only distribution is rendered prominently (callout, banner, or visually distinct block)
- [ ] Integration code samples in the README compile when copy-pasted into a fresh Android module (verify by replicating in a scratch project)
- [ ] Code samples in the README match the actual contents of `:sample` (exact match or annotated divergence)
- [ ] Troubleshooting section addresses the three named scenarios: cannot connect from desktop, release build broken, release APK contains Argus classes
- [ ] Configuration reference covers all `ArgusConfig` options with defaults and effects

### 6.10 Code quality
- [ ] No `TODO`, `FIXME`, or `HACK` markers in shipped code paths (test code may have annotated TODOs)
- [ ] Public API has KDoc on all classes, properties, and functions
- [ ] No unused imports, no commented-out code
- [ ] Modules are documented either by the root README §11 module table + KDoc on the public API, or by per-module READMEs — both are acceptable.
- [ ] Test coverage:
  - `:argus-core` `commonTest` covers the Ktor plugin against `MockEngine` and the logger delegate against a fake bus
  - `:argus-server-core` `jvmTest` covers routing via Ktor's `testApplication` (Ktor's test host is JVM-only at the project's Ktor version; this matches `commonTest`'s expressivity for the routing surface since the routing code itself lives in `commonMain`)
  - `:argus-android` and `:argus-ios` each include a smoke test for `Argus.start()` and `stop()`
- [ ] No reflection used in capture paths (Ktor plugin and logger delegate)
- [ ] No platform-specific code in `commonMain` of any KMP module
- [ ] No `runBlocking` calls in production code paths

### 6.11 Performance
- [ ] Ktor client plugin adds less than 2 ms p99 latency over a `MockEngine` baseline (measured benchmark in `:argus-core` `commonTest` or `androidTest`)
- [ ] Logger delegate publish path completes in under 1 ms for a 1 KB message with payload (measured)
- [ ] Server cold-start (from `Argus.start()` to bound port) under 500 ms on a mid-tier device

### 6.12 Security and privacy
- [ ] Default redacted headers are present and case-insensitive
- [ ] Adding a custom header to `redactHeaders` works as expected
- [ ] No sensitive data (auth tokens, cookies) appears in captured events when default redaction is in effect (verify by inspecting captured headers)
- [ ] No data is sent to any external service from the device (verify by network monitoring during sample app run)
- [ ] The README explicitly documents the LAN-exposure risk and recommends not running on untrusted networks

---

## 7. Implementation status

All MVP scope (originally tracked across four phases) is shipped: HTTP capture (Ktor / OkHttp / HttpURLConnection), log capture, correlation IDs, persistence, per-host full-body bypass, custom events, the iOS module, and the unified sample app. This section was previously a phase-deferral list; it has been superseded by the implementation.

---

## 8. Reviewer deliverables

The reviewer is expected to produce:

1. **Verification report** — pass/fail status for each item in section 6, with file/line references for failures.
2. **Risk register** — any architectural drift, hidden coupling, or future-maintenance concerns observed during review.
3. **Performance measurements** — actual numbers for the benchmarks called out in sections 6.5, 6.7, 6.11. These should be repeatable.
4. **Design-spec adherence summary** — qualitative assessment of how closely the implemented UI matches the `design_handoff_argus_inspector/` JSX prototypes, with screenshots paired against the prototypes.
5. **Recommendation** — overall: ship as-is, ship with minor corrections, or block on listed defects.

---

## 9. Out-of-scope for this audit

The reviewer is not expected to:
- Re-validate originally phased-out features now folded into the MVP — see §7
- Audit the KMMLogging library itself (treated as a stable upstream dependency)
- Audit the Ktor library
- Validate Lynxal internal Maven repository configuration
- Validate Canvas Control consumer apps' integration (covered separately)

---

## 10. Glossary

- **Argus** — this product
- **ArgusEvent** — sealed event type covering HTTP, Log, and Custom captures
- **ArgusEventBus** — the contract by which capture sources publish events to the server
- **CDP** — Chrome DevTools Protocol; explicitly not implemented
- **KMMLogging** — Lynxal's KMP logging library at `com.lynxal.logging:logging`
- **KMP** — Kotlin Multiplatform
- **Lantern** — Lynxal's mDNS library; explicitly not used by Argus (mDNS dropped)
- **Stetho** — Facebook's now-unmaintained debug bridge; the reference Argus replaces

---

End of document.
