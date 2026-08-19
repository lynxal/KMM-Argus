# Fix: a failed server bind kills the host app

## Context

Starting Argus with a pinned port that another process already owns **terminates the host application**. Reported in the field (Canvas Control bug #810) with two byte-identical iOS crash logs; the sample and every README example pin `port = 8787`, so the documented happy path is exactly the configuration that can fail.

The existing `try/catch` in both facades cannot see the failure, because the throw happens in a *different* coroutine.

### Root cause (verified against Ktor 3.4.1 sources)

`ArgusServer.start()` (`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusServer.kt:71`) calls the top-level `embeddedServer(CIO, port = config.port)`, which delegates to `GlobalScope.embeddedServer(...)` — so `parentCoroutineContext` is `EmptyCoroutineContext`.

Chain, all confirmed by reading the extracted sources:

1. `CIOApplicationEngine.initServerJob()` — `CoroutineScope(applicationProvider().parentCoroutineContext + engineDispatcher).launch(start = LAZY)`. With an empty parent context this is a **root `StandaloneCoroutine` with no `CoroutineExceptionHandler`**.
2. Inside it, `startConnector()` → `httpServer(settings)` (`ktor-server-cio` `backend/HttpServer.kt`) → `acceptJob = launch(serverJob + …) { aSocket(selector).tcp().bind(host, port) … }`. **The `bind()` happens here**, two coroutine levels below `start()`.
3. `bind()` throws (`BindException` on JVM, `PosixException` on K/N) → `acceptJob` fails → cancels its parent `serverJob` → cancels the `StandaloneCoroutine`.
4. `StandaloneCoroutine.handleJobException` → `handleCoroutineException(context, …)`; context has no handler → Android's default uncaught handler kills the process, K/N `abort()`s. This is exactly the frame pair in the iOS crash logs.

In parallel, `acceptJob.invokeOnCompletion` completes the `socket` deferred exceptionally → `initServerJob`'s own `catch` calls `startupJob.completeExceptionally(cause)` → `start()` *does* throw into the facade's `catch` → `handle.onFailed(t)` runs and logs. **So we both log the error and crash.** `startupError` plumbing is already correct; the process just dies alongside it.

**Does a handler in `parentCoroutineContext` actually intercept it?** Yes. `handleCoroutineException` reads `context[CoroutineExceptionHandler]` first, and that context is `parentCoroutineContext + engineDispatcher + Job`.

> **Corrected during implementation.** The plan as approved claimed a `SupervisorJob` parent was *required* for the handler to fire, and that a plain `Job` would route the exception elsewhere. That was wrong. Measured on the JVM across four variants: no handler crashes whether the parent is a plain `Job` or a `SupervisorJob`; with the handler, both parents intercept *and* report. The handler alone is the fix. `SupervisorJob` is kept for a different and real reason — Ktor parents the `Application`'s own scope off the same context, and a plain `Job` would let an engine failure cancel it.

### Intended outcome

- A bind failure — for any errno, not just `EADDRINUSE` — never terminates the host process, on Android or iOS.
- The failure surfaces where it already should: `ArgusHandle.startupError`, plus the existing `Log.e`/`NSLog` line.
- New opt-in `portFallback` flag (**default `false`**): when a pinned port is unavailable, rebind on port `0` instead of giving up. Default off, so no consuming team's fixed-port setup changes without asking.
- The sample app actually shows the error, and the README stops describing the old behavior.

## Decisions

| Decision | Choice |
|---|---|
| Port-conflict behavior | New `portFallback: Boolean = false`. Off → report the error and stay down (today's documented contract). On → retry once on port `0`. |
| Where the fix lives | `argus-server-core/commonMain` — one change covers Android and iOS. |
| How async failures reach the handle | New `ArgusServer.engineError: StateFlow<Throwable?>`; facades collect it and forward to `handle.onFailed`. Keeps `ArgusHandle`'s public contract unchanged. |
| Scope | Library + sample surfacing + README/docs. |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-19-1520-argus-port-bind-crash/` with:

- `plan.md` — this plan
- `shape.md` — scope, the root-cause trace above, decisions, the `SupervisorJob + CEH` rationale
- `standards.md` — "None directly applicable. `agent-os/standards/` is Canvas-app-oriented; the closest advisory reads are `coroutines/async-error-handling.md` and `architecture/error-handling.md`, neither of which governs this library's error surface (it uses `StateFlow`, not `Result<T>`/sealed hierarchies)." Follow the precedent set by `agent-os/specs/2026-05-24-1430-argus-reconnect-loop-and-fast-iter/standards.md`.
- `references.md` — `ktor-server-cio` `CIOApplicationEngine.kt` / `backend/HttpServer.kt` (the authoritative evidence), `agent-os/specs/2026-04-30-1845-project-audit/audit-report.md` finding R8 (the audit item that created `startupError`), `argus-android/src/androidUnitTest/.../ArgusSmokeTest.kt` (test shape to copy)
- No `visuals/` — none provided.

## Task 2: Stop the crash in `ArgusServer`

`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`

1. Add the failure surface:
   ```kotlin
   private val _engineError = MutableStateFlow<Throwable?>(null)
   /** Non-null once the embedded engine has failed — at bind time or later at runtime. */
   public val engineError: StateFlow<Throwable?> = _engineError.asStateFlow()
   ```
2. Replace the bare `embeddedServer(CIO, …)` call with a scoped one carrying the handler. Extract a private helper so the fallback path in Task 3 reuses it:
   ```kotlin
   private fun buildEngine(port: Int): EmbeddedServer<CIOApplicationEngine, CIOApplicationEngine.Configuration> {
       val scope = CoroutineScope(
           SupervisorJob() + CoroutineExceptionHandler { _, cause -> _engineError.value = cause },
       )
       return scope.embeddedServer(CIO, port = port) {
           installArgusRoutes(buffer, config.appInfo, config.corsDevOrigins)
       }
   }
   ```
   Notes for the implementer:
   - Use the `CoroutineScope.embeddedServer` **extension** (`io.ktor.server.engine.embeddedServer`), which sets `parentCoroutineContext = coroutineContext + parentCoroutineContext`. This avoids `GlobalScope` and `@OptIn(DelicateCoroutinesApi::class)`.
   - The handler is what prevents the crash; `SupervisorJob` isolates the `Application`'s scope from an engine failure. Keep both, but don't repeat the earlier claim that the supervisor is required for interception — it isn't.
   - The scope is local and never cancelled; Ktor's `stop()` completes the engine's job, which then detaches from the supervisor. Nothing to manage.
3. Guard the connector read — `resolvedConnectors().first()` throws `NoSuchElementException` on an empty list, masking the real cause:
   ```kotlin
   resolvedPort = server.engine.resolvedConnectors().firstOrNull()?.port
       ?: error("Argus server started but no connector was resolved (port ${config.port})")
   ```
4. Fix the failed-start state leak. Today `engine = server` is assigned *before* `server.start()` (`:74`), so a failure leaves a dead engine in the field and any retry trips `check(engine == null)` with a misleading "called twice". Wrap the start/resolve in a `try`, and on failure `runCatching { server.stop(0, 0) }` and leave `engine = null` before rethrowing.
5. Mark `engine` `@Volatile` — it is written on `Dispatchers.Default`/`IO` and read from `stop()` on the caller's thread, while the adjacent `resolvedPort` already is.

Contract to preserve exactly: on failure `boundPort` still throws `IllegalStateException`, `url` stays `null`, and a successful start is byte-for-byte unchanged.

## Task 3: `portFallback` flag

- `argus-server-core/.../ArgusConfig.kt` — add `val portFallback: Boolean = false` with KDoc: only consulted when `port != 0`; on bind failure the server rebinds on an OS-assigned port, so `boundPort`/`url` report the real one.
- `argus-server-core/.../ArgusConfigBuilder.kt` — add `public var portFallback: Boolean = false`, forward it in `build()`. (Its constructor and `build()` are `internal`, so `argusConfig(...)` stays the only external path.)
- `ArgusServer.start()` — after the first attempt fails, and only when `config.port != 0 && config.portFallback`, clear `_engineError`, retry once via `buildEngine(0)`, and log/record that the pinned port was unavailable. If the retry also fails, rethrow the *first* throwable with the second attached via `addSuppressed` (JVM) or as `cause`. Retry on any start failure — the crash logs do not establish the errno, so do not gate on `BindException`/`EADDRINUSE`.

## Task 4: Forward `engineError` in both facades

`argus-android/src/androidMain/kotlin/com/lynxal/argus/android/Argus.kt` and `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/Argus.kt` — keep the existing `try/catch` (it is correct and still the primary path), and add alongside it:

```kotlin
scope.launch {
    server.engineError.filterNotNull().collect { handle.onFailed(it) }
}
```

This catches engine failures that happen *after* a successful bind, which nothing surfaces today. `MutableStateFlow` dedups the identical instance, so a bind failure reported through both paths sets `startupError` once. `ArgusHandle` needs no change.

While here, align the two facades' dispatchers — Android uses `Dispatchers.Default`, iOS uses `Dispatchers.IO` for the same work. Pick `Dispatchers.Default` for both; per the memory note, `kotlinx.coroutines.IO` in commonMain needs an explicit import, but these are platform source sets so it does not apply.

## Task 5: Tests

- `argus-android/src/androidUnitTest/.../ArgusSmokeTest.kt` (Robolectric, mirrors the existing test shape):
  - **`start on an occupied port reports startupError and does not crash the process`** — start A on `port = 0`, read `A.boundPort`, start B pinned to it. Install a `Thread.setDefaultUncaughtExceptionHandler` for the duration and assert it recorded nothing (restore it in `finally`). On the JVM, `handleCoroutineException` with no handler routes to exactly that handler, so this test genuinely fails before the fix. Assert `B.startupError` becomes non-null and `B.url` stays `null`.
  - **`portFallback rebinds on a free port`** — same setup with `portFallback = true`; assert `B.url` becomes non-null and its port differs from A's.
  - **`a failed start can be retried`** — covers the Task 2.4 state leak.
- `argus-ios/src/iosTest/.../ArgusSmokeTest.kt` — the double-start case. K/N cannot intercept the abort, so pre-fix this manifests as a dead test process; that is the assertion. **Backtick test names must not contain parentheses** — `compileTestKotlinIos*` rejects them.
- `argus-server-core/src/jvmTest/` — a direct `ArgusServer` double-bind test, since the existing route tests use `testApplication` and never bind a real socket.

## Task 6: Sample app surfaces the error

- `sample/src/commonMain/.../debug/DebugTools.kt` — add `fun observeArgusError(): StateFlow<String?>`. Return a **`String?`, not `Throwable`**, so the release no-op stays trivial and no Argus type crosses the seam.
- `sample/src/androidDebug/.../DebugToolsImpl.kt` and `sample/src/iosArgusEnabledMain/.../DebugToolsImpl.kt` — map `argus.startupError` to a message string (`ioScope` + `map`/`stateIn`, or `startupError.map { it?.message }`).
- `sample/src/androidRelease/.../DebugToolsImpl.kt` and `sample/src/iosArgusDisabledMain/.../DebugToolsImpl.kt` — return the existing `empty` flow. Do not touch the invariant comment at the top of the release files.
- `sample/src/commonMain/.../ui/App.kt` and `ui/SampleScreen.kt` — thread the flow through and render an error line next to the existing `url?.let { … "Argus: $bound" }` block at `SampleScreen.kt:56`.
- `sample/src/androidMain/.../MainActivity.kt` and `sample/src/iosMain/.../MainViewController.kt` — pass the new flow.

## Task 7: Docs

- `README.md` §9.1 port table — document `portFallback` (default `false`) next to `port`.
- `README.md` §12 troubleshooting item 3 ("Port conflict") — replace "`Argus.start()` fails" with: the app no longer crashes, `startupError` is set, and `portFallback = true` rebinds on a free port. Add "surface `ArgusHandle.startupError` in your debug UI" to the integration steps, since nothing in the docs mentions it today.
- KDoc on `ArgusConfig.port` / `ArgusConfigBuilder.port` — both currently say "a pinned port will make `start()` fail". Reword.
- `agent-os/product/tech-stack.md` — note it still describes `expect class ArgusServer`, which no longer exists. Fix only if trivial; otherwise leave and flag.

## Verification

```bash
./gradlew :argus-server-core:jvmTest :argus-android:testDebugUnitTest
./gradlew jvmTest testDebugUnitTest testReleaseUnitTest \
  :argus-okhttp:test :argus-urlconnection:test \
  :sample:assembleDebug :sample:verifyReleaseHasNoArgus
./gradlew :argus-ios:iosSimulatorArm64Test      # ARGUS_SKIP_IOS_SMOKE must be unset
```

End-to-end on a device — the case from the bug report:

1. `./gradlew :sample:installDebug`, launch, confirm `I/Argus: Argus listening on http://…:8787`.
2. With that instance running, `adb forward tcp:8787 tcp:8787` from the host — or launch a second app instance — so the port is taken, then relaunch the sample.
3. **Expected:** the app starts and stays up; logcat shows `E/Argus: Argus start failed`; the sample screen shows the error line and no URL.
4. Set `portFallback = true` in `sample/src/androidDebug/.../DebugToolsImpl.kt`, repeat: the sample comes up with a URL on a different port, reachable in a browser.
5. iOS: same two runs via `-PargusEnabled`, confirming no `abort()`.

Then confirm the happy path is untouched: single instance on `8787`, open the web UI, fire the sample's HTTP buttons, check events stream over `/ws`.

## Risks

- **The handler-interception claim is the whole fix.** It is verified by source reading, but Task 5's uncaught-handler assertion is what actually proves it. Run that test *before* the fix and confirm it fails — if it passes pre-fix, the reproduction is wrong and the diagnosis needs revisiting. Fallback if the handler turns out not to intercept: bind a probe socket inside `start()` before handing the port to Ktor, so the failure lands where the existing `try/catch` can see it.
- `SupervisorJob()` in `parentCoroutineContext` also becomes the parent of the Ktor `Application`'s job. Ktor's `stop()` path is unaffected (it cancels and joins the engine's job directly), but the shutdown sequence deserves a look during review.
- Adding `portFallback` to `ArgusConfig` widens a public `data class` — additive with a default, so source-compatible.
- Not established: the errno behind the field crash. The fix is deliberately errno-agnostic.

---

## Outcome

Shipped as planned, with one correction to the diagnosis (see the callout in Context) and one
addition: the errno, which the field crash logs could not show, turned out to be `EADDRINUSE (48)`.

Both platforms reproduced and then fixed, measured rather than reasoned:

| | Pre-fix | Post-fix |
|---|---|---|
| JVM / Android | `java.net.BindException: Address already in use` reaches `Thread.getDefaultUncaughtExceptionHandler()` | nothing reaches it |
| iOS / Kotlin-Native | `PosixException.AddressAlreadyInUseException: EADDRINUSE (48)` reaches `setUnhandledExceptionHook` | nothing reaches it |

The iOS reproduction needed the hook recorder to be visible at all — asserting only on
`startupError` passes even with the crash present, because the error reaches the handle by a
separate route. Any future refactor of this area should keep both hook assertions.

Not done: `agent-os/product/tech-stack.md` still describes `expect class ArgusServer`, which no
longer exists. Left alone — unrelated to this fix and out of scope.

## Follow-up work (same branch)

`stop()` hardening and lifecycle documentation, prompted by the never-crash requirement. See the
"Follow-up" section of `shape.md` for the audit and what was found. Summary of changes:

- `ArgusServer` — `stop()` is idempotent, terminal, and isolates every teardown step; new
  `stopSuspend()` avoids blocking the caller; `start()` refuses to restart a stopped instance.
- `ArgusHandle` (both platforms) — `stop()` is idempotent and non-throwing, logs teardown failures.
- `Argus.start()` (both platforms) — persistence-store construction guarded; falls back to
  `NoopEventStore` rather than crashing the host.
- `:sample` — `stopArgus()` across the seam and a **Stop Argus** button.
- `README.md` — new §9.3 "Lifecycle — `start()`, `stop()`, and the never-crash contract", a
  feature bullet for the contract, and `stopArgus()` added to every code listing.
- Tests — `ArgusServerStopTest` (7 cases) plus a handle-level stop case in each platform's
  `ArgusPortConflictTest`, asserting nothing reaches the global handler.

Final state: 432 JVM/Android tests and 5 iOS tests, 0 failures, with `--rerun-tasks`.
