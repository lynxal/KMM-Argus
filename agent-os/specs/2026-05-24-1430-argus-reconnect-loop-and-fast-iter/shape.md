# Argus Reconnect Loop & Fast Iter — Shaping Notes

## Scope

Two related problems surfaced by the user using argus `0.0.2` inside `../ProvisionerKMP`:

1. The web UI at `http://localhost:8787/` (adb-forwarded from a debug build) is stuck in a permanent "Reconnecting…" banner.
2. There is no way to iterate on an argus fix from inside ProvisionerKMP without round-tripping through Maven Central. Every change requires bumping `coordinates(…)` in 7 modules, running the `publishToMavenCentral` workflow, waiting for Central to index, and bumping the consumer.

## Decisions

- **Fast iter mechanism**: Gradle composite build (`includeBuild`) as primary. Fastest possible — no publish step, source edits picked up on Gradle sync.
- **Fallback iter mechanism**: `publishToMavenLocal` + `-SNAPSHOT` suffix via a `argus.localSnapshot=true` property. Useful for verifying jar-form before pushing.
- **Single version source**: move version into root `gradle.properties` (`argus.version=0.0.2`) — currently duplicated across 7 `coordinates(…)` calls. Halves Task 7 release work.
- **Bug-fix path**: verify HEAD first (`a910b34` + `f268d4e` + `f780741` likely already fix it). Only diagnose further if HEAD still loops.
- **Probe scripts**: a raw-WS Node probe (`ws-probe.js`) for the wire-level check, plus a Playwright UI probe (`ui-probe.js`) for the end-user view. Manual only, not CI — CI has no live consumer.

## Live-probe evidence (gathered during shaping)

Run against `localhost:8787` while ProvisionerKMP debug APK was active:

- `curl /api/info` → 200, `{"pkg":"com.lynxal.canvasprovisioner.android.dev",...,"argusVersion":"0.1.0","schemaVersion":2}` — note `argusVersion` is the AppInfo string the consumer passes in, not the library version.
- Webui's `ARGUS_SCHEMA_VERSION` = 2 (`argus-webui/src/transport/schema.ts:9`). Schemas match — not a hello-mismatch disconnect.
- Node `ws` client → HTTP 101 upgrade succeeds, `onopen` fires, server drops TCP within 1 ms with close code **1006** (abnormal, no close frame). Hello frame never arrives.
- Conclusion: server-side handler is closing the session before sending Hello, or Hello send itself is failing in a way that doesn't surface a close frame. `0.0.2`'s `streamOutbound` predates the drop-oldest fix — slow-consumer kill path is the prime suspect.

## Context

- **Visuals**: none provided.
- **References**: `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Ws.kt`, `InstallArgusRoutes.kt`, `argus-webui/src/transport/websocketSource.ts`, ProvisionerKMP `shared/src/androidDebug/.../debug/DebugToolsImpl.kt` + `iosArgusEnabledMain/.../debug/DebugToolsImpl.kt`. See `references.md` for full pointers.
- **Product alignment**: N/A — argus is a debug-only tool, not user-facing.

## Standards Applied

None directly. `agent-os/standards/` is mobile-focused (analytics, bluetooth-mesh, provisioning, etc.) and not relevant to this server/webui work.
