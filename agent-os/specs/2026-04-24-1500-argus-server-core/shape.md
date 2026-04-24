# `:argus-server-core` — Shaping Notes

## Scope

Ship the embedded Ktor HTTP + WebSocket server that hosts the Argus inspector on-device. This module:

- Provides the concrete `ArgusEventBus` (`ChannelEventBus`) that the already-shipped Ktor client plugin (`:argus-core`) and KMMLogging delegate (`:argus-core`) publish into.
- Owns the single ring buffer fan-out to REST snapshot queries and WebSocket subscribers.
- Houses all REST + WS route code and the SPA-serving logic (reusing `:argus-webui-bundle`).
- Declares `expect class ArgusServer` and provides JVM + Android actuals (Ktor CIO) in `jvmAndAndroidMain` and an iOS actual in `iosMain`.

Consumer-facing API (bare skeleton):

```kotlin
val server = ArgusServer(ArgusConfig(appInfo = AppInfo(...)))
server.start()                 // suspend; returns once port is bound
server.boundPort               // populated post-start
pluginConfig.eventBus = server.eventBus
```

## Decisions (captured via AskUserQuestion)

1. **`AppInfo` lives in `:argus-core`.** New `@Serializable data class AppInfo(pkg, versionName, device, argusVersion)` in the shared model package. `HelloPayload` gains a nullable `appInfo` field (backward-compatible; no `ARGUS_SCHEMA_VERSION` bump). Reusable by future host modules (Android, iOS).

2. **Body-bytes endpoints decode `bodyPreview` at serve time.** No change to the `:argus-core` event schema. Content-type drives decode: text types → UTF-8 bytes of the preview string; binary → base64-decoded bytes. Honors Phase 2's "full-body download" non-goal from `agent-os/product/roadmap.md`.

3. **All `ArgusServer` actuals live inside `:argus-server-core`.** Single `jvmAndAndroidMain` intermediate source set holds the JVM CIO actual (Android runs on JVM runtime); `iosMain` holds the native CIO actual. This diverges from the bullet wording in `agent-os/product/tech-stack.md` lines 53-56 but resolves a real compile-time issue: KMP requires actuals in the same module as the `expect`. `:argus-android` will layer mDNS/lantern wiring on top of this public API rather than provide the actual itself.

4. **`GET /api/events` returns an immediate snapshot; WebSocket is the only live channel.** Simpler semantics; no dangling HTTP connections; matches the SPA design which uses `/ws` for live updates. The "fan-out to HTTP long-poll and WS clients" language in the feature spec is reinterpreted as "the ring buffer's snapshot is the fan-out source for HTTP reads."

## Decisions (captured via Plan-agent review)

5. **Ring buffer uses a single-writer actor, not a mutex.** `ArgusEventBus.publish` is non-suspend. A mutex-based design would force `runBlocking` or infect the interface with `suspend`. The buffer owns a `Channel<Op>(UNLIMITED)` inbox, drained by a coroutine pinned to `Dispatchers.Default.limitedParallelism(1)`, which mutates an `ArrayDeque` and an `atomic(persistentListOf())` snapshot. Publish becomes O(1) and lock-free for publishers; snapshot reads are zero-copy.

6. **WS fan-out is per-subscriber `Channel(1024)`, not `MutableSharedFlow(DROP_OLDEST)`.** Silent drop would mask perf bugs and break the spec's "WS reconnect resumes cleanly" guarantee. Instead, a slow subscriber that fills its channel is disconnected with close code `1011 "lagging"`; the client reconnects, re-snapshots, re-subscribes.

7. **`installArgusRoutes` installs features itself.** `ArgusServer` owns the entire `Application` in v1 — no third party contributes to it — so installing `ContentNegotiation`, `WebSockets`, `CORS` inside the installer is safe and keeps the surface area one-function. Splitting into `installArgusFeatures` + `installArgusRoutes` is a Phase 2+ concern if consumers ever want to embed Argus into their own Ktor app.

8. **`start()` is `suspend`.** Deviates from the literal spec shape `fun start()`. `engine.resolvedConnectors()` (both JVM and Native CIO) is suspend, so a non-suspend `start()` would either block (`runBlocking`) or return before `boundPort` is valid. Callers already have a coroutine scope (Android: `lifecycleScope`; tests: `runTest`). Fallback option if this is rejected: `val boundPortDeferred: Deferred<Int>` alongside a non-suspend `start()`.

9. **WS reconnect is a client-side responsibility.** No server-side event-id cursor in v1. On WS disconnect, the client re-issues `GET /api/events` (snapshot) and re-opens `/ws` (live). Phase 2's correlation-IDs work may introduce a server-side cursor.

10. **Ktor 3.2 CIO native availability is a build-time gate, not a plan-time blocker.** If `./gradlew :argus-server-core:compileKotlinIosArm64` fails to resolve `io.ktor:ktor-server-cio` for iOS, the iOS actual becomes a `NotImplementedError` stub until the Phase 4 `:argus-ios` spec picks the real engine. The outcome is recorded during implementation.

11. **Route tests live in `jvmTest`, not `commonTest`.** `ktor-server-test-host` is JVM-only. The feature spec's "commonTest using Ktor test client" phrase is imprecise. Pure-logic tests (ring buffer mechanics, filter parsing, message serialization) stay in `commonTest` and run on both JVM and iOS.

## Context

- **Visuals:** None supplied for this spec. (`visuals/` kept empty for folder symmetry with prior specs.)
- **References:**
  - `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEventBus.kt` (line 14) — non-suspend interface contract driving the actor design.
  - `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEvent.kt` — sealed polymorphic JSON envelope the server fans out.
  - `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt` — `ARGUS_SCHEMA_VERSION = 1` and `HelloPayload`.
  - `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt` (line 16) — source of truth for `DEFAULT_REDACT_HEADERS` re-exported under the new spec name.
  - `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/ArgusUiBundle.kt` (line 24) — SPA fallback semantics already handled, reused in the UI route.
  - `argus-webui-bundle/build.gradle.kts` — `jvmAndAndroidMain` intermediate source set pattern mirrored here.
  - `argus-core/build.gradle.kts` — KMP module convention mirrored here.
  - `agent-os/specs/2026-04-24-1030-argus-webui-bundle/plan.md` — immediate-predecessor spec; its closing note "future `:argus-server-core` will consume via `implementation(projects.argusWebuiBundle)`" is honored exactly.
- **Product alignment:** Directly executes on Phase 1 of `agent-os/product/roadmap.md` ("Embedded Ktor server exposing a REST API and WebSocket stream") and the module matrix row for `:argus-server-core` in `agent-os/product/tech-stack.md` lines 49-58.

## Open risks / follow-ups

- **Ktor 3.2 CIO native on iOS** — confirmed at build time only. Fallback stub documented in Task 10.
- **Streaming JSON on large snapshots** — v1 materializes the full list; acceptable at `maxEvents = 500`. Phase 2 improvement: `respondTextWriter` + array streaming.
- **`maxBodyBytes` / `redactHeaders` on `ArgusConfig` are pass-through** — consumed by `ArgusClientPlugin`, not by this module. Surface this explicitly in docs so consumers don't expect server-side re-redaction.
- **Commit hygiene** — per `workflow/commit-conventions` and the user's standing memory, no `Co-Authored-By` Claude trailer on any commit in this repo.

## Standards Applied

- `kmp/module-boundaries` — one-way deps on `:argus-core` + `:argus-webui-bundle`.
- `kmp/expect-actual-conventions` — expect in commonMain, actuals in platform source sets.
- `kmp/module-build-conventions` — Kotlin 2.2.0, Gradle KTS, version catalog, JVM 17.
- `naming/package-structure` — `com.lynxal.argus.server.{buffer,bus,protocol,filter,routes}`.
- `testing/test-structure` — `kotlin.test` + `runTest`, backtick names, AAA.
- `testing/test-data-factories` — `createTest<Type>()` pattern.
- `coroutines/suspend-vs-flow` — suspend for start/stop; channels for many-to-many fan-out.
- `coroutines/job-lifecycle` — supervised scope, cancel on stop.
- `workflow/commit-conventions` — feat-prefixed commit, imperative, no agent trailer.
