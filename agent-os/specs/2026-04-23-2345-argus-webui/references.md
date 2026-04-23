# References for `:argus-webui`

## Design Handoff (authoritative)

### `design_handoff_argus_inspector/`

- **Location:** `design_handoff_argus_inspector/` at repo root.
- **Relevance:** Authoritative design. Every visual and interaction decision in this spec derives from it.
- **Key artifacts:**
  - `README.md` — full spec: shell anatomy, all screen states (Split, Waterfall, List-only, Empty, Reconnecting, Disconnected), overlay behavior, keyboard shortcut table, animation durations + easings, responsive breakpoints, state-management minimum, design-token catalog.
  - `ds/colors_and_type.css` — token source. CSS custom properties for surfaces, foregrounds, borders, accent, HTTP status classes (2xx/3xx/4xx/5xx/ERR), log levels, method badges, source badges, waterfall segments, connection state, JSON syntax, shadows. Light on `:root`/`.theme-light`, dark on `.theme-dark`. Typography scale (Inter + JetBrains Mono). Spacing scale (4px base). Radii, motion durations, easings. Built into `src/design/tokens.json` by `scripts/build-tokens.ts`.
  - `ds/fonts/` — Inter (Regular/Medium/SemiBold/Bold) + JetBrains Mono (Regular/Medium/Bold) woff2 files. SIL OFL 1.1 licensed, ship with the app. Copied into `src/assets/fonts/`.
  - `ds/logo-mark.svg` — Argus logomark (radar-dish). Used by TopBar.
  - `Argus Inspector.html` — interactive design canvas. Load in a browser to see all 12 artboards across 4 sections with a "Tweaks" panel to toggle theme/density/selection-mode. This is the overview reference.
  - `design-canvas.jsx` — Figma-style pan/zoom canvas that hosts the artboards. Implementation detail of the review tool; not code to port.
  - `argus/Primitives.jsx` — `Icon` catalog (every SVG used anywhere), `Kbd`, `SrcBadge`, helpers `statusTone()`, `methodColor()`, `logTone()`, `formatBytes()`, `formatDur()`. Icons are lifted verbatim into `src/design/icons.ts`.
  - `argus/TopBar.jsx` — TopBar layout, connection pill, view switcher, search, pause/resume, clear, theme toggle, help.
  - `argus/FilterBar.jsx` — source/method/status/level chips, text filters, result count.
  - `argus/EventList.jsx` — virtualized list candidate, Row atom, keyboard-vs-mouse selection distinction, highlight helper.
  - `argus/EventDetail.jsx` — tab router (HTTP/LOG/CUSTOM), Header, NothingSelected empty state.
  - `argus/BodyViewer.jsx` — JsonTree, PlainText, ImageView, HexView, Empty, Truncated variants.
  - `argus/Waterfall.jsx` — time axis, segmented HTTP bars, LOG/CUSTOM ticks, zoom.
  - `argus/Overlays.jsx` — FilterPopover, ShortcutsOverlay, Toast, EmptyInspector, ReconnectingBanner.
  - `argus/Inspector.jsx` — shell that composes all of the above.
  - `argus/data.js` — fixture event stream. Ported to `src/dev/fixtures/events.ts` and reshaped to match the real `ArgusEvent` polymorphic JSON.
- **Important caveat:** `argus/*.jsx` is React 18 via inline Babel. **Code is not ported** — it is reference for layout, states, and interactions only. The target is plain TS + `@preact/signals-core`.

## Consumed Argus APIs (wire contract, hand-mirrored)

### `ArgusEvent` sealed hierarchy — `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`

- `@Serializable sealed interface ArgusEvent { id: String; timestamp: Long; source: EventSource }`
- Subclasses (`@SerialName` → polymorphic discriminator `type`):
  - `HttpEvent(id, timestamp, source=HTTP, request: HttpRequest, response: HttpResponse?, error: HttpError?, durationMs: Long?)`
  - `LogEvent(id, timestamp, source=LOG, level: LogLevel, tag: String?, message: String, payload: Map<String,String>, throwable: ThrowableInfo?)`
  - `CustomEvent(id, timestamp, source=CUSTOM, sourceLabel: String, label: String, direction: Direction, payload: String, metadata: Map<String,String>)`
- Supporting types: `EventSource` (HTTP | LOG | CUSTOM), `Direction`, `HttpRequest`, `HttpResponse`, `HttpError`, `Header`, `ThrowableInfo`, `LogLevel` (via `LogLevelSerializer`).
- Serialization: `Json.encodeToString(ArgusEvent.serializer(), event)` on the Kotlin side → `JSON.parse` on the TS side against the mirrored types.

### `Schema.kt` — `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt`

- `const val ARGUS_SCHEMA_VERSION: Int = 1` — wire-compatibility version.
- `@Serializable data class HelloPayload(schemaVersion: Int = 1, serverName: String = "argus", serverVersion: String? = null)` — first WebSocket frame.

### Transport (to be implemented by `:argus-server-core`)

- `GET /argus/api/device` → device info (TopBar).
- `POST /argus/api/clear` → clear server-side ring buffer.
- `GET /argus/api/events?after=&limit=` → backfill on connect/reconnect.
- `GET /argus/api/events/:id/body?direction=` → full body for truncated-banner "Request full".
- `GET /argus/api/stream` (WebSocket) — first frame `{ type: "Hello", ... }`, then `ArgusEvent` JSON frames, with `{ type: "Ping" }` heartbeat every 5s.

## Related Argus Specs

- `agent-os/specs/2026-04-23-1143-product-tech-stack-md/` — establishes that `:argus-webui` is npm/TS/Vite/Tailwind/`@preact/signals-core`, < 100 KB gzipped.
- `agent-os/specs/2026-04-23-1430-argus-event-model/` — defines `ArgusEvent` schema, `EventSource`, `Direction`, `HelloPayload`, `ARGUS_SCHEMA_VERSION`.
- `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/` — the producer the WebUI consumes (Ktor client plugin).
- `agent-os/specs/2026-04-23-1800-argus-logging-delegate/` — the other producer (KMMLogging delegate).
- `agent-os/specs/2026-04-23-1852-sample-android/` — the current harness. Today it publishes to `ConsoleEventBus`; next prompt swaps in `ArgusServer`'s channel-backed bus so this WebUI can receive live events.
