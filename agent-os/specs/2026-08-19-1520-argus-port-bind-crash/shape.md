# Argus Port-Bind Crash — Shaping Notes

## Scope

Starting Argus with a pinned port that another process already owns **terminates the host
application**. Reported from the field against `0.0.3` (Canvas Control bug #810) with two
byte-identical iOS crash logs from the same build five days apart.

The sample app and every README example pin `port = 8787`, so the documented happy path is
exactly the configuration that can fail. Both facades already wrap `server.start()` in a
`try/catch` that sets `ArgusHandle.startupError` — that plumbing is correct and was never the
problem. The throw happens in a different coroutine, so no call-site catch can reach it.

## Root cause

`ArgusServer.start()` called the top-level `embeddedServer(CIO, port = config.port)`, which
delegates to `GlobalScope.embeddedServer(...)` — leaving `parentCoroutineContext` empty.

1. `CIOApplicationEngine.initServerJob()` does
   `CoroutineScope(applicationProvider().parentCoroutineContext + engineDispatcher).launch(start = LAZY)`.
   With an empty parent context that is a root coroutine with **no `CoroutineExceptionHandler`
   anywhere in its context chain**.
2. Inside it, `startConnector()` → `httpServer(settings)` → `acceptJob = launch(serverJob + …)`,
   and **that** is where `aSocket(selector).tcp().bind(host, port)` runs — two coroutine levels
   below `start()`.
3. `bind()` throws, `acceptJob` fails, `serverJob` is cancelled, the root engine coroutine fails.
4. `StandaloneCoroutine.handleJobException` → `handleCoroutineException`, no handler in context →
   the platform's global handler. On Android that kills the process; on Kotlin/Native it aborts.

Separately, `acceptJob.invokeOnCompletion` completes the socket deferred exceptionally, so
`start()` *also* throws into the facade's catch. The old behaviour was therefore to log the
error correctly **and** crash.

### Evidence gathered during shaping

Both platforms reproduced locally, not inferred:

- **JVM/Android** — `ArgusServerBindTest` records the process-wide
  `Thread.getDefaultUncaughtExceptionHandler()`. Pre-fix it captures
  `java.net.BindException: Address already in use`, with the frames
  `TcpSocketBuilder.bind` → `HttpServerKt$httpServer$acceptJob$1.invokeSuspend(HttpServer.kt:46)`
  and a suppressed `DiagnosticCoroutineContextException` naming
  `LazyStandaloneCoroutine{Cancelled}, Dispatchers.IO` — i.e. `initServerJob`'s launch, with no
  handler in its context. Exactly the predicted path.
- **iOS/Kotlin-Native** — the same test shape with `setUnhandledExceptionHook` captures
  `io.ktor.utils.io.errors.PosixException.AddressAlreadyInUseException: EADDRINUSE (48)`. This also
  settles the errno, which the field crash logs could not show.

Both go green with the fix and fail without it.

## Decisions

- **The fix is one `CoroutineExceptionHandler`** in the context Ktor parents its engine
  coroutines off, installed in `argus-server-core/commonMain` so one change covers both
  platforms. Measured, not assumed: with the handler the exception is intercepted; without it
  the crash reproduces on both platforms.
- **`SupervisorJob` is for isolation, not interception.** An earlier draft claimed it was
  required for the handler to fire. Tested: a plain `Job` + handler intercepts and reports just
  as well, and the handler alone is what stops the crash. It is kept because Ktor parents the
  `Application`'s own scope off the same context, and a plain `Job` would let an engine failure
  cancel it — but the comment in the code says that, and no more.
- **Port-conflict behaviour: opt-in `portFallback`, default `false`.** On → one retry on an
  OS-assigned port. Off → report and stay down, which is today's documented contract. Default
  off so no consuming team's fixed-port setup silently moves; consumers pin ports per build
  flavour and expect the URL to be stable.
- **Retry is errno-agnostic.** Gated on "the start attempt failed", not on `BindException` /
  `EADDRINUSE`, so it holds for any bind failure.
- **Async failures reach the handle via a new `ArgusServer.engineError: StateFlow<Throwable?>`**,
  which both facades collect and forward to `handle.onFailed`. `ArgusHandle`'s public contract is
  unchanged — consumers already read `startupError`. The flow is deliberately gated to failures
  *after* a successful bind: startup failures already propagate out of `start()`, and reporting
  them twice would leave a stale error behind after a successful fallback rebind.
- **Also fixed while in here**, all found during shaping and all reachable on the failure path:
  `resolvedConnectors().first()` throwing `NoSuchElementException` and masking the real cause;
  `engine` being assigned before `start()` so a failed attempt left a dead engine behind and any
  retry tripped the "called twice" guard; `engine` not being `@Volatile` though written on a
  background dispatcher and read from `stop()` on the caller's thread.

## Context

- **Visuals:** none provided.
- **References:** the authoritative evidence is Ktor 3.4.1's own sources —
  `ktor-server-cio` `CIOApplicationEngine.kt` and `backend/HttpServer.kt`. See `references.md`.
- **Product alignment:** N/A. This is a field-crash fix, not roadmap work.

## Standards applied

None directly — see `standards.md`.

---

## Follow-up: the stop path and the never-crash contract

Raised after the bind fix landed: "if we are able to start argus, we should be able to stop it as
well… it should not crash the host app in any circumstances." `ArgusHandle.stop()` already existed
on both platforms but had zero mentions in the README and was never called anywhere, including the
sample — which is why it read as missing.

Probed rather than assumed. `stop()` did the right thing mechanically: released the port, was
effectively idempotent, and didn't leak the socket when it raced the bind. It was **not**
exception-safe. Three unguarded crash paths, all reachable from a host call:

1. **`eventStore.close()` on stop** — `SqlDelightEventStore.close()` → `driver.close()`, which can
   throw (`SQLiteException`). Unguarded, and it also meant a throw there skipped nothing but left
   the failure to reach the host.
2. **`SqlDelightEventStore` construction on start** — the driver is created *eagerly in the
   constructor* (`private val driver = factory.create()`), and the facades built the store
   synchronously in `Argus.start()`, i.e. on the host's main thread inside `Application.onCreate()`.
   A corrupt DB, a full disk or a failed migration crashed the host before any `try/catch`.
3. **Restart after stop returned a zombie.** `stop()` closes the ring buffer permanently
   (`EventRingBuffer.close()` closes its inbox and cancels its scope), yet `start()` on the same
   instance reported *success* — rebinding a server that could never receive another event.

Fixes: every teardown step isolated with `runCatching` and the whole of `stop()` made idempotent and
terminal; a new non-blocking `ArgusServer.stopSuspend()` for callers that can suspend; the store
construction guarded so a persistence failure degrades to in-memory instead of crashing; and
restart-after-stop now fails loudly (inside `start()`, which the facades already catch, so the host
still never sees it).

Deliberately *not* fixed: the store still opens on the caller's thread when `persist = true`, so
`Application.onCreate()` does brief disk I/O. That's a performance concern, not a crash, and moving
it would mean restructuring who owns the buffer and store. Flagged, not changed.

Also documented: the README had **no** lifecycle documentation at all. New §9.3 covers `start()`
being async, `stop()`'s guarantees, and the never-crash contract as a table of failure situations.

Incidental finding for the K/N conventions: backticked test names reject **commas** as well as
parentheses — `compileTestKotlinIos*` fails with `Name contains illegal characters: ","`.
