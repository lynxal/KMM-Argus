# Feature: `:argus-webui`

## Context

Argus' capture side is wired (`:argus-core`: Ktor client plugin, KMMLogging delegate, `ArgusEvent` sealed hierarchy) and `:sample-android` proves it end-to-end against a `ConsoleEventBus` that only dumps to logcat. The next milestone on the Phase 1 roadmap is the browser inspector: a standalone web SPA that renders the event stream a device emits over its embedded Ktor server. Without it, a developer still has nothing beyond logcat.

This spec shapes **`:argus-webui`** — the npm/TypeScript/Vite source tree whose `dist/` will later be packaged as byte arrays by `:argus-webui-bundle` and served by `:argus-server-core`. For this spec it ships as a runnable SPA against a mock fixture (design-handoff `data.js` port). It also pins the **wire contract** (REST + WebSocket, `HelloPayload`, `ARGUS_SCHEMA_VERSION = 1`) that `:argus-server-core` will implement — so when the server lands next, the UI snaps on.

The design is authoritative and complete. It lives at `design_handoff_argus_inspector/` rather than the `docs/design/` layout the prompt described; we accept the handoff as-is (user-confirmed) and treat `README.md` as the interactions spec, `ds/colors_and_type.css` as the token source, `Argus Inspector.html` + `design-canvas.jsx` as the overview reference, and `argus/*.jsx` as per-component visual + behavioral specs. The JSX is **React**, not Preact — code is not ported; patterns, layout, and states are.

## Recommended approach

### Module and stack

- **Module:** `:argus-webui`, standalone npm project at repo root `argus-webui/`.
- **Stack:** TypeScript (strict) + Vite + Tailwind CSS + `@preact/signals-core`.
- **No React.** Components are plain TS factories that return `HTMLElement` and subscribe to signals via `effect()`. Keeps the bundle under the < 100 KB gzipped budget (signals-core alone is ~1 KB).
- **Fonts self-hosted** from `design_handoff_argus_inspector/ds/fonts/` (Inter 400/500/600/700 + JetBrains Mono 400/500/700). Copied into `src/assets/fonts/` at scaffold time; loaded via `@font-face` in a global stylesheet that also re-declares the full token set.
- **Icons bundled** as inline SVG constants lifted from `argus/Primitives.jsx`'s `<Icon name="..."/>` — not fetched.
- **Offline at runtime.** No CDN deps. `npm run build` produces a fully self-contained `dist/`.
- **Dev workflow:** `npm run dev` runs Vite at `http://localhost:5173`; dev opens with `?device=<ip>:<port>` query to pick a live device. Device-side Ktor server CORS-allows `http://localhost:5173` in debug builds only. Production is same-origin (served from `:argus-server-core`), no CORS.

### Component shape (every component follows this)

For each component under `design_handoff_argus_inspector/argus/<Name>.jsx`, create `src/components/<Name>/` with:

- **`<Name>.ts`** — behavior + markup. Exports `function create<Name>(props): HTMLElement`. Subscribes to signals via `effect()`, returns cleanup.
- **`<Name>.styles.ts`** — Tailwind class strings composed from token-backed utilities (`bg-app`, `fg-1`, `status-2xx-bg`, `sp-2`, etc.). Zero hand-picked colors or spacings.
- **`<Name>.states.ts`** — exported `States` map: `{ default, hover, selected, selectedKb, empty, loading, error, connected, reconnecting, disconnected }` as applicable. Variants are composed in `<Name>.ts` via signal-driven class toggling.

### Token pipeline — single source of truth

1. `scripts/build-tokens.ts` parses `design_handoff_argus_inspector/ds/colors_and_type.css` and emits `src/design/tokens.json` (light + dark, plus typography / spacing / radii / motion).
2. `tailwind.config.ts` imports that JSON and expands it into `theme.extend.colors`, `theme.extend.spacing`, `theme.extend.fontSize`, `theme.extend.fontFamily`, `theme.extend.boxShadow`, `theme.extend.transitionDuration`, `theme.extend.transitionTimingFunction`.
3. Dark-mode strategy: `darkMode: ['class', '.theme-dark']`. Theme is applied by toggling `.theme-dark` on `<html>`; `prefers-color-scheme: dark` is respected via the CSS fallback already in `colors_and_type.css`.
4. Build fails if any `.ts` / `.tsx` file contains a raw hex color or px value outside `src/design/`. Enforced by a small `scripts/lint-tokens.ts` check wired into `npm run lint`.

### Transport contract (defined here, implemented by `:argus-server-core` later)

Bakes in the schema that `:argus-core/model/Schema.kt` already exposes (`ARGUS_SCHEMA_VERSION = 1`, `HelloPayload`):

- **REST** `GET /argus/api/device` → `{ name: string, address: string, platform: "android"|"ios"|"jvm", version: string }` — shown in the top bar.
- **REST** `POST /argus/api/clear` — clears the device-side ring buffer (UI also clears its local store).
- **REST** `GET /argus/api/events?after=<timestamp>&limit=<n>` — backfill on connect / reconnect (newest-first).
- **REST** `GET /argus/api/events/:id/body?direction=request|response` — on-demand full body when the truncated banner's "Request full" button is clicked.
- **WebSocket** `GET /argus/api/stream` — server sends first frame `{ type: "Hello", schemaVersion, serverName, serverVersion? }` matching `HelloPayload`; subsequent frames are `ArgusEvent` JSON (polymorphic `type` discriminator: `"HttpEvent"|"LogEvent"|"CustomEvent"`). Client rejects stream if `schemaVersion !== 1`.
- **Heartbeat:** server sends `{ type: "Ping" }` every 5s; gap > 3s → UI marks `reconnecting`; gap > 15s → `disconnected`. Matches the README's state spec.
- **CORS:** server whitelists `http://localhost:5173` (and `http://localhost:*` on dev builds). Production is same-origin.

All contract types live in `src/transport/schema.ts`, hand-mirrored from the Kotlin models with a comment pointing at `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/` — no code generation for now (the wire shape is small and schema-versioned).

### Event store (signals-based, no Redux, no framework)

`src/store/eventStore.ts` exposes:

- `events: Signal<ArgusEvent[]>` — bounded ring buffer, default 10 000 (from README).
- `pausedBuffer: Signal<ArgusEvent[]>` — overflow while `paused` is true.
- `selectedId: Signal<string | null>`, `selectionSource: Signal<'keyboard'|'mouse'>`.
- `view: Signal<'list'|'split'|'waterfall'>` — default `split`.
- `paused: Signal<boolean>`, `theme: Signal<'light'|'dark'>` (persisted in `localStorage`), `density: Signal<'compact'|'comfy'>`.
- `connection: Signal<'connected'|'reconnecting'|'disconnected'>`, `lastSeenAt`, `retryAt`.
- `filters: Signal<Filters>` — single object: `{ sources: Set<'HTTP'|'LOG'|'CUSTOM'>, methods: Set<HttpMethod>, statuses: Set<StatusClass>, levels: Set<LogLevel>, tagQuery: string, hostQuery: string, textQuery: string }`.
- **`filteredEvents: Signal<ArgusEvent[]>`** (computed) — single `applyFilters(events, filters)` derives the displayed list; selection, waterfall, and list all read this.
- **`detailTab: Record<EventKind, string>`** — last-used tab per kind, persisted.

Event ingestion: `src/transport/eventSource.ts` hides REST + WebSocket behind one interface `{ connect(), disconnect(), state: Signal<Connection> }`. A second impl `mockEventSource.ts` replays `src/dev/fixtures/events.ts` (a TS port of the handoff's `data.js`, reshaped to `ArgusEvent` polymorphic JSON). `?device=...` selects real; absence selects mock.

### Keyboard handling

Single global `window.addEventListener('keydown')` in `src/input/keyboard.ts`. Bindings are data, not code:

```ts
const BINDINGS: KeyBinding[] = [
  { key: '/', action: 'focusSearch' },
  { key: 'j', action: 'selectNext' },
  { key: 'k', action: 'selectPrev' },
  { key: 'ArrowDown', action: 'selectNext' },
  { key: 'ArrowUp', action: 'selectPrev' },
  { key: 'Escape', action: 'dismiss' },
  { key: 'f', action: 'openFilter' },
  { key: 'x', action: 'clearFilters' },
  { key: 'p', action: 'togglePause' },
  { key: 'X', shift: true, action: 'clearEvents' },
  { key: 'w', action: 'cycleView' },
  { key: '[', action: 'prevTab' },
  { key: ']', action: 'nextTab' },
  { key: '?', action: 'openShortcuts' },
  { key: 'c', meta: true, action: 'copySelection' },
  { key: 'z', meta: true, action: 'undo' },
];
```

Skipped when `document.activeElement` is an `<input>` / `<textarea>` (except `Escape`). Any nav key sets `selectionSource.value = 'keyboard'`; any click sets it to `'mouse'`. The `ShortcutsOverlay` renders from the same `BINDINGS` array, so the modal cannot drift from the handler.

### Motion

Durations and easings come from the token pipeline (`--dur-fast 80ms`, `--dur-base 120ms`, `--dur-slow 160ms`, `--ease-out`, `--ease-in-out`). Every animated component wraps its `transition-duration` and `animation-duration` in a `@media (prefers-reduced-motion: reduce)` guard that collapses to `0.01ms` — `colors_and_type.css` already provides a global rule, re-apply it in `src/styles/globals.css` after the token re-declarations.

### Perf approach (drives acceptance)

- **EventList virtualization:** custom `VirtualList` in `src/components/EventList/virtual.ts` — fixed row height (28 or 32 px), windowed render of visible + 10-row overscan. No external virtualization dep (keeps bundle down).
- **Waterfall** draws to a single `<canvas>` for bars / ticks, DOM-layered for the hovered tooltip and selection rail. Canvas redraw is keyed to `filteredEvents` and `zoom`; re-renders skipped when nothing changed.
- **Filter recompute** is synchronous — `applyFilters` is pure and < 10ms on 10k events when implemented with `for`-loops over typed arrays. No debouncing on chips. Only text inputs debounce (120ms per README).
- **Search highlight** precomputes match ranges once per event on `textQuery` change; list rows only read their slice.

## Critical files

```
argus-webui/
├── package.json                             # name "argus-webui", scripts: dev/build/lint/tokens
├── tsconfig.json                            # strict
├── vite.config.ts                           # server: localhost:5173, build to dist/
├── tailwind.config.ts                       # imports src/design/tokens.json; darkMode: ['class','.theme-dark']
├── postcss.config.js
├── index.html
├── scripts/
│   ├── build-tokens.ts                      # parses design_handoff_argus_inspector/ds/colors_and_type.css -> src/design/tokens.json
│   └── lint-tokens.ts                       # fails build on raw hex / px outside src/design/
├── src/
│   ├── main.ts                              # entry
│   ├── app.ts                               # Shell: TopBar + FilterBar + Content + StatusBar; reads ?device= to choose source
│   ├── design/
│   │   ├── tokens.json                      # GENERATED — do not edit
│   │   └── icons.ts                         # inline SVG catalog ported from Primitives.jsx
│   ├── styles/
│   │   └── globals.css                      # @font-face (self-hosted), token re-declarations, prefers-reduced-motion
│   ├── assets/fonts/                        # copied from design_handoff_argus_inspector/ds/fonts/
│   ├── store/
│   │   ├── eventStore.ts                    # signals: events, filters, selection, view, paused, theme, connection
│   │   ├── filters.ts                       # applyFilters(events, filters)
│   │   └── persistence.ts                   # localStorage read/write for theme, density, detailTab
│   ├── transport/
│   │   ├── schema.ts                        # ArgusEvent, HttpEvent, LogEvent, CustomEvent, HelloPayload, EventSource, Direction
│   │   ├── eventSource.ts                   # interface: connect/disconnect/state
│   │   ├── websocketSource.ts               # real REST + WS impl
│   │   └── mockSource.ts                    # replays src/dev/fixtures/events.ts
│   ├── input/
│   │   └── keyboard.ts                      # single global listener; BINDINGS data table; Action dispatcher
│   ├── components/
│   │   ├── Primitives/                      # SrcBadge, Kbd, Icon, Pill, Chip — atoms
│   │   ├── TopBar/                          # device info, clear, pause/resume, theme toggle, connection pill, view switcher
│   │   ├── FilterBar/                       # source chips, method/status/level chips, host/tag/contains inputs
│   │   ├── EventList/
│   │   │   ├── EventList.ts                 # virtualized list
│   │   │   ├── EventList.styles.ts
│   │   │   ├── EventList.states.ts
│   │   │   ├── Row.ts                       # the atom — SrcBadge + method/level + status + primary text + meta
│   │   │   └── virtual.ts                   # fixed-height windowing
│   │   ├── EventDetail/
│   │   │   ├── EventDetail.ts               # tab router: HTTP | LOG | CUSTOM | NothingSelected
│   │   │   ├── tabs/HttpTabs.ts             # Headers | Request | Response | Timing | Related Logs | Raw + Copy-as-cURL + HAR export
│   │   │   ├── tabs/LogTabs.ts              # Message | Payload | Stack Trace | Raw
│   │   │   └── tabs/CustomTabs.ts           # Payload | Metadata | Raw (Phase 3 scaffold)
│   │   ├── BodyViewer/                      # JsonTree | PlainText | ImageView | HexView | Empty + truncated banner
│   │   ├── Waterfall/                       # canvas bars + ticks; DOM tooltip + selection rail; zoom/pan
│   │   ├── SplitView/                       # list + waterfall with synchronized selection
│   │   ├── Overlays/                        # ShortcutsModal, FilterPopover, Toast, ConnectionBanner
│   │   └── EmptyStates/                     # WaitingForEvents, NoMatches, NothingSelected
│   └── dev/fixtures/events.ts               # TS port of design_handoff_argus_inspector/argus/data.js
└── dist/                                    # Vite build output; consumed by :argus-webui-bundle later
```

Repo-level: add `argus-webui/node_modules/` and `argus-webui/dist/` to `.gitignore`. No Gradle wiring in this spec — `:argus-webui-bundle` handles that in a later prompt.

## Tasks

### Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-23-2345-argus-webui/` with `plan.md`, `shape.md`, `standards.md`, `references.md`, `visuals/`.

### Task 2 — Scaffold `:argus-webui` project

- `npm init`, install: `vite`, `typescript`, `@preact/signals-core`, `tailwindcss`, `postcss`, `autoprefixer`, `vitest`, `@types/node`. Pinned versions in `package.json`.
- `tsconfig.json` with strict + `"moduleResolution": "bundler"`.
- `vite.config.ts`: dev server 5173, build target `es2020`, `cssCodeSplit: false`, `assetsInlineLimit: 4096`.
- `postcss.config.js`, `tailwind.config.ts` (empty theme for now — filled in Task 3).
- `src/main.ts` + `src/app.ts` stubs that render a blank shell reading `?device=`.
- `src/styles/globals.css` with `@font-face` rules pointing at `src/assets/fonts/` (copy woff2s from `design_handoff_argus_inspector/ds/fonts/`).
- `src/design/icons.ts` — inline SVG catalog ported from `design_handoff_argus_inspector/argus/Primitives.jsx` `Icon` switch (same paths, same viewBoxes).
- Acceptance: `npm run dev` serves a blank page that loads Inter + JetBrains Mono from disk (verify in DevTools Network — no external requests).

### Task 3 — Tokens pipeline + Tailwind theme

- `scripts/build-tokens.ts` — reads `design_handoff_argus_inspector/ds/colors_and_type.css`, parses light + dark blocks + the base `:root` typography/spacing/radius/motion block, writes `src/design/tokens.json` shaped as `{ light: {...}, dark: {...}, typography, spacing, radii, motion }`. Semantic names carry through (`bg-app`, `status-2xx-fg`, etc.). Run via `npm run tokens`; also wired as a Vite plugin `buildStart` hook so `npm run dev` regenerates on startup.
- `tailwind.config.ts` — imports `tokens.json`, expands into `theme.extend.{colors,spacing,fontSize,fontFamily,fontWeight,lineHeight,letterSpacing,borderRadius,boxShadow,transitionDuration,transitionTimingFunction}`. `darkMode: ['class', '.theme-dark']`. Colors emit CSS-var-backed values so theme swap is a single class toggle.
- `scripts/lint-tokens.ts` — greps `src/**/*.{ts,tsx,css}` for raw hex / px outside `src/design/` + `src/styles/globals.css`. Wired to `npm run lint`.
- Acceptance: `npm run build` produces a CSS file where every color/spacing resolves to a token-backed CSS var; `npm run lint` fails if a raw `#` or `px` value is introduced in a component file.

### Task 4 — Transport layer + event store

- `src/transport/schema.ts` — TS types mirroring `ArgusEvent`, `HttpEvent`, `LogEvent`, `CustomEvent`, `EventSource`, `Direction`, `HelloPayload`. Polymorphic discriminator `type`. Guards `isHttpEvent` / `isLogEvent` / `isCustomEvent`.
- `src/transport/eventSource.ts` — interface `{ connect(): Promise<void>; disconnect(): void; state: Signal<ConnectionState>; events: Signal<ArgusEvent[]> }`.
- `src/transport/websocketSource.ts` — real impl: `GET /argus/api/device` for device info, `GET /argus/api/events` for backfill, `WebSocket` at `/argus/api/stream` with `Hello` handshake and `Ping` heartbeat (3s/15s thresholds).
- `src/transport/mockSource.ts` — replays `src/dev/fixtures/events.ts` with realistic inter-event timing; simulates reconnects on `?simulate=reconnect`.
- `src/dev/fixtures/events.ts` — TS port of `design_handoff_argus_inspector/argus/data.js` reshaped to `ArgusEvent` polymorphic form (HTTP with request/response objects, LOG with tag + payload, CUSTOM with `sourceLabel` / `label` / `direction` / `payload`).
- `src/store/eventStore.ts` — signals + derived `filteredEvents` + ring buffer cap.
- `src/store/filters.ts` — `applyFilters(events, filters)` as one pure function.
- `src/store/persistence.ts` — localStorage for theme, density, detailTab.
- `src/app.ts` picks `mockSource` when `?device=` absent, `websocketSource` when present.
- Acceptance: load with `?simulate=reconnect` → UI cycles `connected → reconnecting → disconnected → connected` at the correct timings; store caps at 10 000 events (confirm via `events.value.length`).

### Task 5 — TopBar

Port `TopBar.jsx` behavior: logo + wordmark + version chip (left), connection pill (center-left, three states with pulsing amber dot for reconnecting), view switcher (List / Split / Waterfall segmented control), global search (focus on `/`, 240px, mono placeholder), pause/resume toggle, clear button (triggers `POST /argus/api/clear` + local clear), theme toggle, help button (`?`). Binds to `eventStore` signals; emits actions through `keyboard.ts`'s action dispatcher so shortcut = button. Matches `TopBar.jsx` pixel layout.

### Task 6 — FilterBar

Port `FilterBar.jsx`: source toggles (HTTP/LOG/CUSTOM), method multi-select (GET/POST/PUT/PATCH/DELETE/OTHER), status class (2xx/3xx/4xx/5xx/ERR) with dots, log level (ERROR/WARN/INFO/DEBUG/VERB), text inputs (host-contains, tag-contains, text-contains) with 120ms debounce. Right-click "only this" deselects siblings. Result count `<shown>/<total>` + Clear link. Mutates `filters` signal; `filteredEvents` updates synchronously.

### Task 7 — EventList (virtualized)

Port `EventList.jsx` + virtualize it. Fixed 28px (compact) or 32px (comfy) rows. Row = `[SrcBadge][method or LEVEL][status pill or —][primary text, ellipsized + highlight matching textQuery][meta: duration or timestamp]`. Keyboard selection = `bg-selected-kb` + 2px left rail; mouse = `bg-selected`. Hover non-selected = `bg-subtle`. 1px `border-subtle` dividers. Live-append: new row flashes `bg-selected → transparent` over 200ms. "Jump to latest · N new" pill bottom-center when scrolled away. Reads `filteredEvents`.

### Task 8 — EventDetail + BodyViewer

Port `EventDetail.jsx` + `BodyViewer.jsx`.
- Tab router switches on selected event kind: `HttpTabs` (Headers | Request | Response | Timing | Related Logs | Raw) with Copy-as-cURL and HAR export; `LogTabs` (Message | Payload | Stack Trace | Raw); `CustomTabs` (Payload | Metadata | Raw — Phase 3 scaffold).
- `NothingSelected` empty state when `selectedId === null`.
- BodyViewer variants: JsonTree (collapsible + hover path breadcrumb), PlainText (wrap toggle), ImageView (checkerboard + meta footer), HexView (16-col with offset gutter), Empty, Truncated banner with "Request full" that calls `GET /argus/api/events/:id/body`.
- `detailTab` signal remembers last tab per kind.
- Related Logs (HTTP tab) reads from `events.value` and computes log events within the HTTP event's timespan (± 500ms for now — correlation is Phase 2).

### Task 9 — Waterfall + SplitView

Port `Waterfall.jsx` and wire split-view selection sync.
- Waterfall panel: 28px header row (Event column + count · time axis with 5 tick marks · zoom in/out + zoom factor). Body: canvas-drawn rows. HTTP = 3 stacked segments (Connect gray / Wait amber / Download status-tinted); errored = dashed red outline. LOG/CUSTOM = 2px vertical tick in source color. Duration column right, 70px mono.
- Click to select (syncs `selectedId`); `selectionSource = 'mouse'`. Hover tooltip via DOM layer.
- Zoom (`+`/`-` buttons) derives the axis from visible events.
- SplitView component composes EventList + Waterfall with synchronized `selectedId` and a 1px resizable divider (hover widens to 3px).
- Acceptance: with 1000 events in the store, initial draw + zoom step < 100ms (measure via `performance.now()` around the redraw).

### Task 10 — Overlays + empty/connection states + global keyboard handler

- `ShortcutsModal` — 560px centered, scrim `rgba(20,22,24,0.35)`, renders from the same `BINDINGS` array used by the keyboard handler.
- `FilterPopover` — 300px anchored below FilterBar's "Add filter" button; Method grid, Status class grid, Reset / Apply (with `↵` kbd hint).
- `Toast` — bottom-center, auto-dismiss ~3s, 180ms slide-up + fade; used for "Copied as cURL", "Filter cleared", "Events cleared (⌘Z to undo)".
- `ConnectionBanner` — 32px full-width strip when `connection !== 'connected'`; tinted amber (reconnecting) or red (disconnected); shows last-seen + retry countdown + "Retry now".
- `EmptyStates`: `WaitingForEvents` (radar SVG + address chip + Copy/Docs buttons + "Press ? for shortcuts"), `NoMatches` (inside list when filters yield zero), `NothingSelected` (inside detail panel).
- `src/input/keyboard.ts` — single global listener, data-driven BINDINGS, action dispatcher that reads `document.activeElement` to skip inside text inputs (except `Escape`). Dispatcher flips `selectionSource` to `'keyboard'` on any nav key.
- Acceptance: manually walk through the full shortcut table; every binding works, every overlay opens/closes as spec'd.

### Task 11 — Perf + bundle + Lighthouse gate

- Load-time: `npm run build` then sum gzipped asset sizes (`gzip -c dist/assets/* | wc -c`) — verify total < 100 KB. Fail the task if over budget — drop Tailwind's JIT-unused utilities via `content` glob tuning, trim icons, or inline fewer fonts.
- `npm run lighthouse` script (via `lighthouse` CLI) against the built bundle served by `npx serve dist`. Perf > 95 in light and dark.
- Measurement harness `src/dev/perf.ts` (dev-only entry): generates 10 000 mock events, reports list scroll fps (requestAnimationFrame sampling), waterfall redraw with 1 000 events (< 100ms), filter-change latency (< 16ms), highlight across 500 events (< 50ms). Run via `npm run perf`.
- Manual: keyboard shortcuts pass table walk; every mockup state (12 artboards in `Argus Inspector.html`) visually matches within pixel tolerances in light + dark.

## Verification (end-to-end)

1. `cd argus-webui && npm install && npm run tokens && npm run dev` → open `http://localhost:5173` → `WaitingForEvents` empty state renders (mock source, no events yet).
2. `http://localhost:5173/?simulate=mock` → fixture events stream in; EventList appends with flash animation; selecting a row shows EventDetail with HTTP Headers tab; pressing `w` cycles List → Split → Waterfall; `?` opens ShortcutsModal matching BINDINGS.
3. `http://localhost:5173/?simulate=reconnect` → ConnectionBanner appears amber after 3s, red after 15s, clears on resume.
4. `npm run build` → `dist/` produced; total gzipped < 100 KB.
5. `npm run lint` → zero token violations. Inject a raw `#ff0000` in a component file and re-run → fails as expected.
6. `npm run perf` → reports pass all thresholds.
7. `npx serve dist && npm run lighthouse` → perf score > 95 light + dark.
8. Theme toggle (keyboard / button) swaps `.theme-dark` on `<html>` — every pixel re-tints via tokens; no layout shift.
9. `grep -RnE '#[0-9a-fA-F]{3,6}\b' argus-webui/src/ | grep -v src/design | grep -v src/styles/globals.css` → no matches.
10. When `:argus-server-core` lands: run a debug Android build, note its IP:port, open `http://localhost:5173/?device=<ip>:<port>` → live events stream. (Out of scope for acceptance of this spec; contract is defined here.)

## Upgrade path (not this prompt)

- **Next prompt** lands `:argus-server-core` implementing the transport contract defined here (REST endpoints + WebSocket with `HelloPayload`), plus `:argus-android` (`actual ArgusServer` via Ktor CIO) and mDNS discovery via `:lantern-android`. `:sample-android`'s `ConsoleEventBus` is then replaced with `ArgusServer`'s `ChannelEventBus` and the UI starts receiving real events.
- **`:argus-webui-bundle`** follows, generating KMP byte arrays from `dist/` consumed by `:argus-server-core`.
- **Phase 2** adds proper request↔log correlation (replacing the ±500ms heuristic), session persistence, WebSocket frame support in the event model, and full-body download.
- **Phase 3** promotes `CustomTabs` from scaffold to full (replay / breakpoints / SQLite inspection / view hierarchy integration).
