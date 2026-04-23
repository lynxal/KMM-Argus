# Argus Ktor Client Plugin — Shaping Notes

## Scope

A Ktor `HttpClient` plugin, `Argus`, that captures method / url / headers /
bodies / status / latency for every call made through an instrumented client
and emits one `HttpEvent` per call (or per error) into an `ArgusEventBus`.

The plugin is the Phase 1 capture source behind the unified timeline in the
Argus inspector — it produces events; the server module consumes them.

## Decisions

- **Module / package:** `:argus-core`, commonMain, `com.lynxal.argus.ktor`.
  `tech-stack.md`'s module matrix explicitly lists the Ktor client plugin as
  a `:argus-core` responsibility ("Ktor client plugin, KMMLogging delegate,
  event schema, event bus") and lists Ktor client core among `:argus-core`'s
  dependencies. Not a new module.
- **Plugin construction:** `createClientPlugin("Argus", ::ArgusClientConfig)` —
  the modern typed-config builder. `val Argus` is the single public entry
  point alongside `ArgusClientConfig`.
- **Body handling:** never consume the real channel. Use Ktor's channel-split
  primitive to tee bytes into an in-memory buffer capped at `maxBodyBytes`;
  the original byte stream stays intact for the real consumer.
- **Encoding:** text-ish content types get a UTF-8 string preview; everything
  else (binary, unknown, `br`/`zstd` opaque) gets a base64 preview. Caller is
  free to render either in the inspector.
- **Overflow:** when the cap is hit, the plugin records `bodyTruncatedTotalBytes`
  (the fully-drained size) and stops buffering but keeps draining so the
  relay never stalls. Phase 2 adds full-body download for truncated responses.
- **Redaction:** case-insensitive set match on header name; matched headers
  keep their name but the value becomes `***redacted***` and
  `Header.redacted = true`. Defaults cover `Authorization`, `Cookie`,
  `Set-Cookie`, `Proxy-Authorization`.
- **No-op:** wiring `eventBus = NoopEventBus` must be zero-cost. `publish()`
  is a single method call on an `object` with an empty body — the JIT will
  elide it. The plugin still does its work, but the bus sink adds nothing.
- **Errors:** hook failures must never propagate to the caller. Any exception
  during capture is logged at debug and swallowed; a best-effort `HttpEvent`
  with `error` populated is emitted on network failures.
- **Correlation:** per-request UUID v4, stashed in Ktor request attributes
  (`ArgusIdKey`, `ArgusStartMsKey`). Proper MDC-style propagation for log↔http
  correlation ships in Phase 2.
- **Testing:** `commonTest` using `MockEngine` — no Android deps. A JVM-only
  latency test (`jvmTest`) guards the p99 < 2 ms acceptance criterion.
- **Public surface:** only `Argus` and `ArgusClientConfig`. Everything else
  (attribute keys, redaction fn, body-capture helpers, plugin internals) is
  `internal`.

## Context

- **Visuals:** None — plugin is non-visual.
- **References:**
  - Ktor `createClientPlugin` / `ClientPlugin` API docs (canonical pattern).
  - `agent-os/specs/2026-04-23-1430-argus-event-model/` — the contract this
    plugin satisfies.
- **Product alignment:** Phase 1 MVP (`roadmap.md` §1) requires a Ktor
  `HttpClient` plugin capturing full request/response metadata and bodies.
  The tech stack (`tech-stack.md`) pins the plugin to `:argus-core`.

## Standards Applied

Inlined verbatim in `standards.md`:

- `kmp/module-boundaries` — `:argus-core` is the base; plugin lives there and
  depends only outward on Ktor client core + `kotlinx.*`.
- `kmp/expect-actual-conventions` — not directly used (plugin is
  `commonMain`-only), but informs the module's source-set layout.
- `cloud/http-error-handling` — informs how we encode error info into
  `HttpError` (throwable class / message / stack trace).
- `security/auth-flow`, `security/login-session`, `security/token-lifecycle`
  — motivate the default redaction list (`Authorization`, `Cookie`,
  `Set-Cookie`, `Proxy-Authorization`) and the `***redacted***` contract.
- `coroutines/job-lifecycle`, `coroutines/flow-composition` — inform how the
  plugin interacts with Ktor's coroutine machinery (no long-lived jobs; all
  work happens in Ktor-owned request scopes).
- `testing/mocking-conventions`, `testing/test-structure`,
  `testing/test-data-factories` — backticked names, AAA, `runTest`, factory
  functions for synthetic `HttpEvent` assertions (leveraging existing
  `EventFactories.kt`).
- `naming/class-suffixes`, `naming/package-structure` — no `*Service` /
  `*Storage` suffixes here (the plugin is neither); package is
  `com.lynxal.argus.ktor` with one top-level declaration per file.
- `workflow/commit-conventions` — `feat:` for the plugin commit, `test:` for
  the test commit, no agent-attribution trailers.
