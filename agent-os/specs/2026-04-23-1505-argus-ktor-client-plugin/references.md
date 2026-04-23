# References — Argus Ktor Client Plugin

## Canonical API pattern

**Ktor `createClientPlugin`** (`io.ktor.client.plugins.api`)

- Source of truth: <https://ktor.io/docs/custom-plugins.html> and
  <https://api.ktor.io/ktor-client/ktor-client-core/io.ktor.client.plugins.api/>.
- Use `createClientPlugin(name, ::Config) { /* body */ }`, inside which
  `pluginConfig` exposes the typed config and `onRequest { request, content -> }`
  / `onResponse { response -> }` register hooks.
- `client.install(Argus) { /* config */ }` at call sites.
- Channel splitting: `io.ktor.utils.io.ByteReadChannel.split(scope)` returns
  two channels that both drain the same source — how we tee bodies without
  consuming the real channel. Pair with a cap-aware reader for the buffered
  side.
- Request attributes: `Attributes` on both `HttpRequestBuilder` and
  `HttpResponse.call` — where we stash `ArgusIdKey` / `ArgusStartMsKey`.

## Contract this plugin satisfies

**`agent-os/specs/2026-04-23-1430-argus-event-model/`**

- Defines `HttpEvent`, `HttpRequest`, `HttpResponse`, `HttpError`,
  `Header(redacted)`, `ArgusEventBus`, `NoopEventBus` — all in
  `com.lynxal.argus.model`.
- This plugin is the first producer of `HttpEvent`; the shape is already
  frozen, so the plugin has no say over field layout — it populates and
  emits.
- Redacted-header contract: value = `"***redacted***"`, `redacted = true`.
  Wire-stable per that spec.
- Schema version constant lives in `Schema.kt` (`ARGUS_SCHEMA_VERSION`);
  this plugin does not change it.

## Similar code in this repo

None. `:argus-core` is currently model-only — this is the first capture
module. Follow the patterns in the event-model spec for naming, file layout,
and testing, not patterns from older repos.

## External prior art (inspiration, not copy)

- **Chucker** (OkHttp-only Android HTTP inspector) — validates the
  tee-without-consume approach for body capture and case-insensitive
  redaction. Not cited as a code reference; architecture is different.
- **Ktor `Logging` plugin** (first-party) — worth skimming as a reference
  implementation of `createClientPlugin` that captures request/response
  metadata, though it consumes bodies rather than teeing them.
