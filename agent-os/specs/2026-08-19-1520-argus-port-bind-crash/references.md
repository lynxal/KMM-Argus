# References

## Primary evidence — Ktor 3.4.1 sources

Not codebase references; these are what the diagnosis rests on. Extract from the Gradle cache:

```bash
unzip -o ~/.gradle/caches/modules-2/files-2.1/io.ktor/ktor-server-cio/3.4.1/*/ktor-server-cio-3.4.1-sources.jar
```

### `commonMain/io/ktor/server/cio/CIOApplicationEngine.kt`

- `initServerJob()` — `CoroutineScope(applicationProvider().parentCoroutineContext + engineDispatcher).launch(start = LAZY)`.
  This is the coroutine that fails. Everything hinges on what `parentCoroutineContext` carries:
  with nothing in it, there is no `CoroutineExceptionHandler` to find.
- Its `catch` block calls `startupJob.completeExceptionally(cause)` and then rethrows — which is
  why `start()` sees the error *and* the process still dies.

### `commonMain/io/ktor/server/cio/backend/HttpServer.kt`

- `acceptJob = launch(serverJob + CoroutineName("accept-$settings")) { aSocket(selector).tcp().bind(...) }`
  — the actual bind, line 46. Appears by name in both the JVM stack trace and the field iOS
  crash logs.

### `commonMain/io/ktor/server/engine/EmbeddedServer.kt`

- The top-level `embeddedServer(factory, port, host, watchPaths, module)` delegates to
  `GlobalScope.embeddedServer(...)`, so `parentCoroutineContext` is `EmptyCoroutineContext`.
- The `CoroutineScope.embeddedServer(...)` **extension** is the one to use: it sets
  `parentCoroutineContext = coroutineContext + parentCoroutineContext`. That is the injection
  point for the handler, and it avoids `GlobalScope` and `@OptIn(DelicateCoroutinesApi::class)`.

## Codebase references

### Prior art for `startupError`

- `agent-os/specs/2026-04-30-1845-project-audit/audit-report.md` finding R8 — "`Argus.start()`
  swallows server-start failures on iOS … `handle.url` stays `null` forever". That audit item is
  why `ArgusHandle.startupError` exists. This spec finishes the job: the error was already being
  reported, the process just died alongside it. Nothing consumed the flow, in the sample or the
  README, which is why the crash read as unexplained.

### Test shape to copy

- `argus-android/src/androidUnitTest/.../ArgusSmokeTest.kt` — Robolectric + `runBlocking` (not
  `runTest`: the server binds in real time and a virtual scheduler never advances), 5 s
  `withTimeout` on `url.first { it != null }`, `stop()` in a `finally`.
- `argus-ios/src/iosTest/.../ArgusSmokeTest.kt` — same shape, plus the CI note about
  `ARGUS_SKIP_IOS_SMOKE` and the KGP iOS test-reporter flake.

### Seam pattern the sample change has to respect

- `sample/src/commonMain/.../debug/DebugTools.kt` — the interface, zero `com.lynxal.argus.*` imports.
- `sample/src/androidRelease/.../DebugToolsImpl.kt` and
  `sample/src/iosArgusDisabledMain/.../DebugToolsImpl.kt` — the no-ops, each with an invariant
  comment naming the CI gate that enforces it.
