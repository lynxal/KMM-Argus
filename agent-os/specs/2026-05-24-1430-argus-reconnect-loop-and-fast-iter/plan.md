# Argus — Fix Web-UI Reconnect Loop + Enable Fast Local Iteration

See the full approved plan at `~/.claude/plans/i-m-using-argus-in-tidy-llama.md`.

## Summary

Two-phase work:

1. **Phase A — Fast local iteration**: wire Gradle composite build in ProvisionerKMP via `includeBuild("../argus")` + `dependencySubstitution`; add `publishToMavenLocal` + `argus.localSnapshot=true` flag as a fallback.
2. **Phase B — Diagnose & fix the WS reconnect loop**: with HEAD argus consumed by ProvisionerKMP, verify whether already-merged-but-unpublished commits (`a910b34`, `f268d4e`, `f780741`) resolve the loop. If yes → publish 0.0.3. If no → use the new `/ws threw …` log line to diagnose, fix at root, re-verify.

## Tasks

1. Save spec docs (this folder)
2. Wire composite build in `ProvisionerKMP/settings.gradle.kts`
3. Refactor argus modules to share `argus.version` from root `gradle.properties` + add `argus.localSnapshot` SNAPSHOT switch
4. Reproduce loop against HEAD via composite build
5. If still broken: diagnose with logcat + fix root cause
6. Add `scripts/probe-webui/` (ws-probe.js + ui-probe.js Playwright)
7. Bump `argus.version=0.0.3`, tag, release

## Verification

End-to-end:
- `./gradlew :argus-server-core:jvmTest` green
- ProvisionerKMP debug build succeeds against composite-included argus
- `http://localhost:8787/` UI banner shows "Connected" within 2 s, stays connected ≥ 60 s
- `node scripts/probe-webui/ws-probe.js` exits 0, frame timeline shows Hello < 1 s + server ping at ~20 s
- `node scripts/probe-webui/ui-probe.js` exits 0
- Fallback path: `-Pargus.localSnapshot=true publishToMavenLocal` + `mavenLocal()` in consumer also produces a working build
