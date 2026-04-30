# Argus Project Audit — Shaping Notes

## Scope

Full audit of the Argus codebase against `argus-audit-spec.md` covering completeness, missing features, and security. Output is a written audit report under this spec folder. No code changes.

## Decisions

- **Static review only.** No `./gradlew` builds, no `apkanalyzer`, no Lighthouse, no benchmarks. Runtime checklist items are marked "unverified — requires runtime" with a note on what the user should run.
- **Security scan covers all three layers:** manual code review (redaction, CORS, auth posture, LAN exposure, input validation), static dependency CVE check (read versions from `gradle/libs.versions.toml`, `package.json`, `package-lock.json` and flag known-vulnerable versions), secret scan (grep for committed credentials/tokens/keys).
- **Phase 3/4 modules treated as in-scope.** `:argus-okhttp`, `:argus-urlconnection`, `:argus-ios` exist on `main` (recent commits) — user has accepted these as scope expansion. They are audited as first-class modules, not flagged as drift per spec §9.
- **Parallel fan-out via 8 sub-agents.** Each owns one slice and writes a separate findings file to avoid write collisions. Agents owning broad slices may recursively dispatch (e.g. Agent G dispatches three children for code review / deps / secrets).
- **Consolidation in main thread.** The final `audit-report.md` synthesis applies judgment across all findings, so it stays in the main loop rather than being delegated.

## Context

- **Visuals:** None.
- **References:** `argus-audit-spec.md` (root) is the contract. Module list per `settings.gradle.kts`. Recent git log indicates Phase 3 (okhttp, urlconnection) and Phase 4 (ios) modules have landed.
- **Product alignment:** `agent-os/product/mission.md` is partially stale — it mentions mDNS via `:lantern-android` but spec §3.8 explicitly drops mDNS. The audit follows the spec, not mission.md.

## Standards Applied

- `agent-os/standards/security/*` — auth-flow, login-session, token-lifecycle inform the security review baseline (Argus has no auth in v1, must document LAN risk).
- `agent-os/standards/kmp/module-boundaries` — informs §6.10's "no platform code in commonMain" check.
- `agent-os/standards/workflow/commit-conventions` — feedback memory says "no AI attribution in commits"; the audit doesn't commit, so not directly applicable but noted.

## Out of scope

- Validation of the KMMLogging or Ktor libraries themselves (per spec §9).
- Lynxal internal Maven repo configuration (per spec §9).
- Canvas Control consumer integration (per spec §9).
- Live performance benchmarking (per static-only decision).
