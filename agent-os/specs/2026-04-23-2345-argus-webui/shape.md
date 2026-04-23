# `:argus-webui` — Shaping Notes

## Scope

A standalone npm/TypeScript/Vite SPA at repo-root `argus-webui/` that renders the Argus event stream in a browser. Ships runnable against a **mock event source** (fixture ported from `design_handoff_argus_inspector/argus/data.js`) and pins the **REST + WebSocket wire contract** that `:argus-server-core` will implement next. When that server lands, the UI snaps onto a live device via `http://localhost:5173/?device=<ip>:<port>`; no app-side changes.

Built to the design handoff at `design_handoff_argus_inspector/` (colors_and_type.css as token source, README as interactions spec, per-region `.jsx` prototypes as visual+behavioral reference). The JSX is React; this build is framework-free TS + `@preact/signals-core`. Code is not ported wholesale — layout, states, and interactions are.

No Gradle wiring in this spec. `:argus-webui-bundle` (KMP) will later package `dist/` into byte arrays consumed by `:argus-server-core`; that's a separate prompt.

## Decisions

- **Treat `design_handoff_argus_inspector/` as authoritative** even though the `shape-spec` prompt named `docs/design/` with a stricter layout (tokens.json, per-component folders, interactions.md, overview.png/pdf). User-confirmed. The handoff is pixel-perfect and complete in spirit — it just encodes the same information differently (CSS vars instead of JSON, README instead of interactions.md, an interactive HTML canvas instead of a PNG). Every rule the prompt imposes on visuals and interactions remains enforceable against these artifacts.
- **Generate `tokens.json` at build.** `scripts/build-tokens.ts` parses `ds/colors_and_type.css` once at build start and emits `src/design/tokens.json`; `tailwind.config.ts` reads the JSON to populate `theme.extend`. This keeps the CSS file as the single source of truth (hand-maintained by the designer) and gives Tailwind a deterministic input. Chosen over (a) Tailwind referencing `var(--x)` directly — would skip the single-source invariant the prompt asks for — and (b) hand-transcribing to a TS constant — invites drift.
- **Define the wire contract in this spec.** `:argus-server-core` does not exist yet. The UI is scaffolded against mock data so work does not block, but `src/transport/schema.ts` pins polymorphic `ArgusEvent` JSON (same `type` discriminator `kotlinx.serialization` uses), `HelloPayload` (`ARGUS_SCHEMA_VERSION = 1`), REST endpoints (`/argus/api/device`, `/argus/api/clear`, `/argus/api/events`, `/argus/api/events/:id/body`), WebSocket `/argus/api/stream`, and the 3s/15s heartbeat thresholds. The server spec lands next and implements this contract.
- **No UI framework.** Plain TS factories (`function create<Name>(props): HTMLElement`) subscribing to `@preact/signals-core` via `effect()`. Keeps the < 100 KB gzipped budget realistic; signals-core is ~1 KB, Tailwind JIT trims unused CSS, Vite code-splits. Chosen over Preact/Solid/Vue to avoid even their (small) runtimes.
- **Event store = signals, not Redux.** `events: Signal<ArgusEvent[]>`, `filters: Signal<Filters>`, `filteredEvents` computed as a derived signal. Single `applyFilters(events, filters)` pure function; list, waterfall, and count all read the same derived slice. Matches the README's "minimum state" shape exactly.
- **Ring buffer capped at 10 000** (README default). Pausing accumulates into `pausedBuffer`; resume flushes in order. Clear is undoable within ~5s via the toast.
- **EventList virtualized in-house.** Fixed-height rows (28 or 32 px per density) → windowed render with 10-row overscan. No virtualization library — the math is ~50 LOC and each extra dep threatens the bundle budget.
- **Waterfall on canvas.** One `<canvas>` draws bars + ticks + axis; DOM layers the tooltip and the selection rail. Re-render keyed to `(filteredEvents, zoom)`; no redraw on hover. Aims for < 100 ms draw + zoom at 1 000 events.
- **Keyboard handling is a data table.** One global `keydown` listener reads a `BINDINGS: KeyBinding[]` array; the shortcuts modal renders from the same array. Impossible for the modal to drift from the handler.
- **Keyboard-vs-mouse selection distinction is explicit.** Nav keys flip `selectionSource.value = 'keyboard'` (row gets `bg-selected-kb` + 2px `border-focus` rail); clicks flip it to `'mouse'` (row gets `bg-selected`, no rail). README flags this as subtle but load-bearing for feel.
- **Empty / loading / error / connection states are first-class.** `EmptyStates/WaitingForEvents` + `EmptyStates/NoMatches` + `EmptyStates/NothingSelected`; `ConnectionBanner` for `reconnecting | disconnected`. Tracked as explicit component modules with dedicated `<Name>.states.ts`.
- **Motion respects `prefers-reduced-motion`.** `colors_and_type.css` ships the global rule; we re-apply it in `src/styles/globals.css` after re-declaring tokens, and all components use token-backed durations (`--dur-fast 80ms`, `--dur-base 120ms`, `--dur-slow 160ms`).
- **Offline at runtime.** Fonts bundled from `ds/fonts/` (Inter + JetBrains Mono woff2), icons inlined as SVG strings in `src/design/icons.ts`. No CDN. No network fetches except the device endpoint.
- **Dev CORS is a device-side concern.** Vite serves at `:5173`; device's Ktor server allow-lists that origin in debug builds only. Production is same-origin (served from `:argus-server-core`).

## Context

- **Visuals:** `design_handoff_argus_inspector/` — `README.md` (full spec, keyboard table, animation timings), `ds/colors_and_type.css` (tokens, light + dark), `ds/fonts/` (woff2 bundles), `ds/logo-mark.svg`, `Argus Inspector.html` (interactive canvas of 12 artboards across 4 sections — open in a browser), `argus/*.jsx` (React prototypes for TopBar, FilterBar, EventList, EventDetail, BodyViewer, Waterfall, Overlays, Primitives, Inspector shell + `data.js` fixture).
- **References:**
  - `agent-os/specs/2026-04-23-1430-argus-event-model/` — `ArgusEvent` schema (v1), `EventSource`, `Direction`, `HelloPayload`, `ARGUS_SCHEMA_VERSION`.
  - `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/` — the producer the WebUI consumes.
  - `agent-os/specs/2026-04-23-1800-argus-logging-delegate/` — the other producer.
  - `agent-os/specs/2026-04-23-1852-sample-android/` — the current exerciser; will switch from `ConsoleEventBus` to `ArgusServer`'s bus in the next prompt.
- **Product alignment:**
  - Phase 1 roadmap: `:argus-webui` is explicitly listed alongside `:argus-core`, `:argus-webui-bundle`, `:argus-server-core`, `:argus-android`. This spec ships only `:argus-webui`; sibling modules follow.
  - Tech-stack constraint: `:argus-webui` = TS + Vite + Tailwind + `@preact/signals-core`; bundle target < 100 KB gzipped. Honored.
  - Mission: "on-device Ktor server, any-browser access over LAN via mDNS" — the UI is the browser side of that bet.

## Standards Applied

- **`naming/package-structure`** — singular folder names in `src/` (`component/` would be wrong, but the repo's webui layout uses domain names like `TopBar/`, `EventList/` which are effectively components; subfolders `store/`, `transport/`, `input/`, `design/`, `styles/`, `components/`, `dev/` are singular). One top-level export per file (`EventList.ts` exports `createEventList`; `Row.ts` exports `createRow`; `schema.ts` is the lone exception — it groups the small set of wire-contract types, which is consistent with the Kotlin model package grouping them in `argus-core/model/`).
- **`naming/code-documentation`** — JSDoc on every exported factory and every `transport/` / `store/` symbol; inline comments only where the **why** is non-obvious (e.g., `// keyboard rail is load-bearing for power-user feel — see handoff README`). No commentary on obvious code.
- **`kmp/module-boundaries`** — `:argus-webui` sits at the same tier as `:sample-android` in the Argus dep graph: a top-of-graph consumer. It depends on nothing in Argus directly (the wire contract is hand-mirrored) and is depended on only by `:argus-webui-bundle` (later prompt). Its TS imports stay strictly intra-project.
- **`validation/no-internal-apis`** — adapted: no unstable browser APIs (`navigator.scheduling.*` experimental, `requestIdleCallback` gated by a feature check, no `Chrome/*`-only APIs). Tailwind's `@apply` within component styles is fine; `@layer` is public. `@preact/signals-core` public surface only (no `__internal_` exports).
- **`testing/test-structure`** — adapted: Vitest, `describe`/`it`, AAA structure. Tests under `src/**/__tests__/*.test.ts` mirror source tree. Backticked test names where they read naturally (`it('filters out events whose host does not match hostQuery', ...)`). Critical tests in this spec: `applyFilters` truth table, `buildCurl` output snapshot, `keyboard.ts` dispatcher skipping within `<input>`.
- **`workflow/commit-conventions`** — `feat(webui): …` / `chore(webui): …` / `docs(webui): …` conventional subjects, 72 char cap, imperative mood. No AI attribution trailers — per the user's standing `feedback_no_ai_attribution` memory on this repo.
