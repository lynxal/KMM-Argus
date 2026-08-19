# Standards

None directly applied. `agent-os/standards/` in this repo is mobile-domain focused (analytics,
bluetooth-mesh, provisioning, ui-navigation, etc.) and does not cover embedded-Ktor server
lifecycle work. Two entries are adjacent but do not govern this change:

- `coroutines/async-error-handling.md` — about `Result<T>` mapping and retry backoff in the
  Canvas app's BLE/network layers. This library reports lifecycle state through `StateFlow`,
  not `Result<T>`, and the retry here is a single deterministic rebind, not backoff.
- `architecture/error-handling.md` — sealed error hierarchies extending `Throwable`. Argus
  surfaces the underlying platform throwable verbatim on `ArgusHandle.startupError`; wrapping it
  in a sealed type would hide the errno consumers need.

Project-level conventions from `AGENTS.md` that DO apply:

- Commit conventions: conventional-commit, scoped to module (`fix(argus-server-core):`),
  **no AI agent trailers**.
- Stage files explicitly by name (no `git add .` / `-A`).
- Test names: backticks, AAA layout, `kotlin.test` for multiplatform. Kotlin/Native rejects
  parentheses inside backticked test names — `compileTestKotlinIos*` fails with "Name contains
  illegal characters".
- Distribution: argus is `debugImplementation` only. CI gates `:sample:verifyReleaseHasNoArgus`
  and `:sample:verifyIosReleaseHasNoArgus` must stay green — the new `observeArgusError()` seam
  method returns `StateFlow<String?>` rather than the `Throwable` specifically so no Argus type
  crosses into the release source set.
