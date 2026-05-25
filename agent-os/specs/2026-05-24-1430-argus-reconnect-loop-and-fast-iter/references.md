# References

## Server-side WS handler

- **`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Ws.kt`**
  - Line 20: `webSocket("/ws")` registration
  - Line 23: immediate `send(Hello)` *before* try/catch — if this throws on a slow socket, no log line fires
  - Line 26: `buffer.subscribe()` returns the per-session channel
  - Line 38-40: outer try/catch logs `/ws threw …` (added in `a910b34`)
  - Line 48-59: `streamOutbound` — receives from channel, filters, sends
- **`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/InstallArgusRoutes.kt`**
  - Line 33-41: `WebSockets` install with `pingPeriodMillis = 20_000`, `timeoutMillis = 30_000` (server-driven pings, added `a910b34`)
  - Line 42-55: CORS install — only enabled when `corsOrigins.isNotEmpty()`
- **`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/buffer/EventRingBuffer.kt`**
  - Line 96-100: per-subscriber `Channel` with `BufferOverflow.DROP_OLDEST` (changed `f268d4e`)
  - Line 166: broadcast `trySend` only reacts to closed-channel failures, not overflow
- **`argus-server-core/src/jvmTest/kotlin/com/lynxal/argus/server/routes/WsTest.kt`** — existing WS tests; must stay green

## Web UI reconnect logic

- **`argus-webui/src/transport/websocketSource.ts`**
  - Line 35-40: WS URL = `${wsScheme}://${host}/ws`
  - Line 91-100: schema-version check; mismatch → `disconnect()` (permanent), not reconnect-loop
  - Line 125-127: `ws.onclose` → `scheduleReconnect()`
  - Line 135-150: backoff state machine (500 ms → 10 s)
  - Line 153: `connect()` entry — fetch /api/info → backfill /api/events → open WS
- **`argus-webui/src/transport/schema.ts`**
  - Line 9: `ARGUS_SCHEMA_VERSION = 2`
- **`argus-webui/src/components/ConnectionBanner.ts`** (approximate path) — renders `"Reconnecting…"` text from `connection === 'reconnecting'`

## ProvisionerKMP consumer

- **`../ProvisionerKMP/shared/src/androidDebug/kotlin/com/lynxal/canvasprovisioner/debug/DebugToolsImpl.kt`** lines 30-33 — `Argus.start(app) { port = 8787 }`
- **`../ProvisionerKMP/shared/src/iosArgusEnabledMain/kotlin/com/lynxal/canvasprovisioner/debug/DebugToolsImpl.kt`** lines 29-32 — `Argus.start { port = 8787 }`
- **`../ProvisionerKMP/gradle/libs.versions.toml`** line 70: `argus = "0.0.2"`; lines 167-168: `argus-android` and `argus-ios` coordinates
- **`../ProvisionerKMP/settings.gradle.kts`** — composite-build hook lands here (Task 2)

## Publishing setup

- `argus/.github/workflows/publishToMavenCentral.yml` — triggered by `workflow_dispatch` or `release: types: [released]`
- Per-module `mavenPublishing { coordinates("com.lynxal.argus", "argus-X", "0.0.2") }` — to be refactored in Task 3 to read from `argus.version` property
- Modules with publishing: `argus-core`, `argus-android`, `argus-ios`, `argus-server-core`, `argus-webui-bundle`, `argus-okhttp`, `argus-urlconnection`. Unpublished: `argus-webui` (TS), `sample`.

## Recent relevant commits

- `a910b34` fix(argus-server-core): server-driven WS pings + handler logging
- `f780741` test(argus-server-core): cover slow-consumer drop-oldest path end-to-end
- `f268d4e` fix(argus-server-core): stop killing slow ws subscribers; bump 0.0.2
- `94758cd` ci: split workflows — verify (JVM/Android), verifyIos (manual), publish (no tests)
