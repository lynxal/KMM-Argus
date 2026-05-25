# Standards

None directly applied. `agent-os/standards/` in this repo is mobile-domain focused (analytics, bluetooth-mesh, provisioning, ui-navigation, etc.) and does not cover server-side Ktor / Gradle publishing / WebSocket handler work.

Project-level conventions from `AGENTS.md` that DO apply:

- Commit conventions: conventional-commit, scoped to module (`fix(argus-server-core):`), **no AI agent trailers**.
- Stage files explicitly by name (no `git add .` / `-A`).
- Test names: backticks, AAA layout, `kotlin.test` for multiplatform.
- Distribution: argus is `debugImplementation` only — never `implementation`/`api`. CI gates `:sample:verifyReleaseHasNoArgus` and `:sample:verifyIosReleaseHasNoArgus` must stay green.
