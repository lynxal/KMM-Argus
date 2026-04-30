# Argus Phase 3 — Shaping Notes

## Scope

Phase 3 deliverables:

1. New `:argus-okhttp` module — `okhttp3.Interceptor` (application-level) publishing `HttpEvent` to the same `ArgusEventBus` with consistent redaction and body caps.
2. New `:argus-urlconnection` module — `ArgusUrlConnection.wrap(HttpURLConnection)` capturing requests/responses on `HttpURLConnection`.
3. Public `ArgusEventBus.publishCustom(source, label, direction, payload, metadata)` extension — formal API for emitting custom events.
4. WebUI source-label filter — dropdown multi-select that discovers `sourceLabel`s dynamically from the live stream.
5. Sample app updates — three debug-only buttons (emit custom, OkHttp call, HttpURLConnection call) demonstrating the mixed-source unified timeline.

## Decisions

- HttpEvent gets a new first-class `engine: String = "ktor"` field; wire schema bumps from v1 to v2. Hard-rejects mismatched WebUI clients on the Hello frame (acceptable since Argus debug + SPA bundle ship in lockstep).
- `:argus-okhttp` and `:argus-urlconnection` are pure-JVM (`kotlin("jvm")`), JVM 17 — OkHttp & HttpURLConnection are JVM-only.
- Source-label filter UI is a dropdown multi-select with auto-discovery from the live event buffer; selection persisted, other filters intentionally not persisted.
- Body-capture & redaction helpers extracted from `:argus-core/.../ktor/` into a new `com.lynxal.argus.capture` package and exposed via `@RequiresOptIn` `@InternalArgusApi` annotation (matches Kotlin's `ExperimentalEncodingApi` precedent).
- `publishCustom` parameter named `source` per spec (maps to `CustomEvent.sourceLabel`).
- Sample app buttons live behind the debug-only `DebugTools` interface; release stubs no-op.

## Context

- **Visuals:** None.
- **References:**
  - Phase 2 spec (`agent-os/specs/2026-04-30-1004-argus-phase2/`) for spec formatting and KMP module conventions.
  - Existing Ktor plugin (`argus-core/.../ktor/ArgusClientPlugin.kt`) for the interceptor pattern to mirror.
  - OkHttp's `HttpLoggingInterceptor` for the request-body re-read pattern (`isOneShot()` check + `Buffer` rebuild).
  - Android's `okhttp.internal.huc.DelegatingHttpsURLConnection` for the canonical `HttpURLConnection` override list.
- **Product alignment:** Closes the "third-party SDK using OkHttp/HttpURLConnection is invisible to Argus" gap that's been blocking unified-timeline use cases.

## Standards Applied

- `kmp/module-build-conventions` — JVM 17 toolchain, version catalog usage.
- `kmp/module-boundaries` — new modules depend down on `:argus-core`; no upward edges.
- `naming/package-structure` — new packages `capture`, `okhttp`, `urlconnection`.
- `naming/class-suffixes` — `Interceptor`, `Config` suffixes preserved.
- `coroutines/job-lifecycle` — sample app's HTTP calls run on `Dispatchers.IO`, never the main thread.
- `workflow/commit-conventions` — `feat:` for new modules, `refactor:` for capture-helper lift, `chore:` for schema version bump.
