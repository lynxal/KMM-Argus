# Web UI Audit (§6.6, §6.7)

Scope: static-only audit of `argus-webui/`, `argus-webui-bundle/`, and the design
artifacts the spec says belong under `docs/design/`. Lighthouse / runtime perf
items are flagged `unverified — requires runtime`.

## §6.6 Design compliance

| #     | Item | Status | Evidence |
|-------|------|--------|----------|
| 6.6.1 | `docs/design/` contains all required artifacts (mockups, `tokens.json`, component specs, interaction notes, design system overview) | **FAIL** | `docs/design/` does not exist. `docs/ui/` contains only 4 PNGs (`event-list.png`, `filters.png`, `hero.png`, `waterfall.png`) — no markdown specs, no `interactions.md`, no `tokens.json`, no per-component spec files, no design-system overview. The actual design source lives under `design_handoff_argus_inspector/` (JSX prototypes, `README.md`, and `ds/colors_and_type.css`) and the runtime token file lives at `argus-webui/src/design/tokens.json`. The artifact layout the spec requires is not in place. |
| 6.6.2 | `tailwind.config.ts` derived from `tokens.json` (no extra hand-picked values) | **PASS** | `argus-webui/tailwind.config.ts:2` imports `./src/design/tokens.json` and spreads every theme bucket (`colors`, `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `spacing`, `height`, `borderRadius`, `boxShadow`, `transitionDuration`, `transitionTimingFunction`) into `theme.extend`. Tokens themselves are auto-generated from `design_handoff_argus_inspector/ds/colors_and_type.css` by `argus-webui/scripts/build-tokens.ts`. |
| 6.6.3 | No hex colors / px values outside Tailwind config | **PARTIAL PASS** | A repo-aware lint exists at `argus-webui/scripts/lint-tokens.ts`, exempting `src/design/`, `src/styles/globals.css`, `src/assets/`. Running the equivalent grep returns **zero** raw hex outside exempt paths. Five `px` literals slip past lint or live in code: `src/components/EmptyStates/WaitingForEvents.ts:17–18` (`width/height = '40px'` set on an inline SVG); `src/components/FilterBar/SourceLabelDropdown.ts:33` (`text-[10px]` Tailwind arbitrary value); `src/components/EventDetail/tabs/HttpTabs.ts:84` (`text-[10px]` arbitrary); `src/components/EventList/Row.ts:181` (`text-[10px]` arbitrary). A handful of `px` strings inside `globals.css` (e.g. `font-size: 10px;` on `kbd.ds-kbd`, line 490; `font-size: 9px;` on `.ds-src-badge`, line 507; modal/banner heights) sit in the exempt zone but **are not driven by tokens** — they are ad-hoc px values that only happen to live in the exempt file. Token system covers them as `fs-xs (11px)` etc., so these badge/kbd sizes (9px, 10px) are sub-token sizes that should arguably be added to the token set. |
| 6.6.4 | Every `docs/design/components/*` has a corresponding `argus-webui/src/components/*` | **PASS (against `design_handoff_argus_inspector/argus/`)** | Mapping (handoff JSX → implementation): `TopBar.jsx` → `components/TopBar/TopBar.ts`; `FilterBar.jsx` → `components/FilterBar/FilterBar.ts`; `EventList.jsx` → `components/EventList/{EventList,Row,virtual}.ts`; `EventDetail.jsx` → `components/EventDetail/EventDetail.ts` + `tabs/{HttpTabs,LogTabs,CustomTabs}.ts`; `BodyViewer.jsx` → `components/BodyViewer/BodyViewer.ts`; `Waterfall.jsx` → `components/Waterfall/Waterfall.ts`; `Overlays.jsx` → `components/Overlays/{Toast,ConnectionBanner,ShortcutsModal}.ts`; `Primitives.jsx` → `components/Primitives/Primitives.ts`; `Inspector.jsx` (shell) → `app.ts` + `components/SplitView/SplitView.ts`. No orphans — every handoff component has an implementation. (No `docs/design/components/*` exists; the check is against the handoff bundle.) |
| 6.6.5 | Every screen state from `docs/design/mockups/` is implemented | **PARTIAL PASS** | `docs/ui/` mockups: `hero.png`, `event-list.png`, `filters.png`, `waterfall.png`. All four shells/views are implemented (List/Split/Waterfall via `SplitView`, FilterBar, EventList, Waterfall). The mockups capture only the populated screen state — empty/loading/error/disconnected states from the handoff README are present in code (see 6.6.6) but cannot be screenshot-compared because no mockups exist for them. |
| 6.6.6 | Empty / loading / error states for every view | **PASS** | Empty: `WaitingForEvents.ts` (no events yet), `EventDetail.ts:109` ("Nothing selected"), `BodyViewer.ts:81` ("No body"), `LogTabs.ts:29,51` ("No payload" / "No stack trace"), `CustomTabs.ts:30` ("No metadata"), `HttpTabs.ts:200` ("No correlated log events"), `SourceLabelDropdown.ts:99` ("No CUSTOM events yet"). Connection: `ConnectionBanner.ts` covers `connected` / `reconnecting` / `disconnected`. Error: HTTP error events render an error pill (`HttpTabs.ts:102-106`) and dashed-red bar in waterfall (`Waterfall.ts:338-343`). No explicit "loading" spinner — backfill is on `connect()` and the ws source flips connection state, which the banner reflects. |
| 6.6.7 | Keyboard shortcuts behave per `docs/design/interactions.md` | **PARTIAL PASS** | `interactions.md` does not exist. Against the spec §5.6 list (`?, /, f, j, k, x, p, w, [, ], Esc`): all eleven keys are handled in `argus-webui/src/input/keyboard.ts:36-53` (also wired arrow keys, ⌘C copy-as-cURL, ⌘Z undo). **Divergence:** spec §5.6 says `x` is "clear with confirm" — the impl maps bare `x` to `clearFilters` and `Shift+X` to `clearEvents` (with toast + ⌘Z undo path, not a confirm dialog). The shortcut bus is the single source of truth shared by the modal (`ShortcutsModal.ts:46-75`), so the modal cannot drift from handler. Tests at `src/input/__tests__/keyboard.test.ts`. |
| 6.6.8 | `prefers-reduced-motion` respected; transition durations match | **PASS** | `argus-webui/src/styles/globals.css:595-603` global override forces `animation-duration: 0.01ms`, `transition-duration: 0.01ms`. Token `transitionDuration` defines `fast: 80ms`, `base: 120ms`, `slow: 160ms` (`tokens.json:171-175`); flash keyframe at line 587-593 (200ms) is the only animation outside the token set. No `interactions.md` to literal-compare to. |

## §6.7 Runtime quality (static signals)

| #     | Item | Status | Evidence |
|-------|------|--------|----------|
| 6.7.1 | Production gzipped bundle < 100 KB | **PASS (JS+CSS portion)** | `argus-webui/dist/assets/`: `index-DgMZouxa.js` raw 75 172 B → **gzip ~22.7 KB**; `style-D6bu4hNz.css` raw 28 365 B → **gzip ~6.8 KB**; `perf-BHzxwHlN.js` raw 1 348 B → gzip ~0.8 KB (dev-only entry). Total app JS+CSS gzipped ≈ **30 KB**, well under 100 KB. **Caveat:** seven self-hosted woff2 fonts add ~162 KB raw (woff2 is already compressed; gzip near-noop). The §3.10 wording is "total gzipped bundle < 100 KB"; if fonts are counted, total ships at ~190 KB. The spec does mandate fonts be bundled (not from CDN, §3.10) which the impl honors via `globals.css:9-57` `@font-face` referencing `src/assets/fonts/*.woff2`. Recommendation: clarify whether the budget excludes binary font payloads, or subset/drop weights (impl ships Inter regular/medium/semibold/bold + JetBrainsMono regular/medium/bold — 7 faces). |
| 6.7.2 | Lighthouse > 95 in light & dark | **unverified — requires runtime** | `package.json:16` defines `lighthouse` script targeting `http://localhost:4173`. No stored Lighthouse report in repo. |
| 6.7.3 | 10 000-event list scrolls without dropped frames | **PASS (static signal: virtualization wired)** | Custom `createVirtualList` in `src/components/EventList/virtual.ts` (122 LOC, no external dep). Fixed 32 px row height, 10-row overscan, pooled DOM elements with key-based reuse, `ResizeObserver` for viewport, `transform: translateY` per row (line 80). Used by `EventList.ts`. Frame-rate measurement requires runtime. |
| 6.7.4 | Waterfall with 1 000 events renders < 100 ms | **unverified — requires runtime** | Waterfall implementation is canvas-based (`Waterfall.ts:80-348`) which is the right architecture for that target. Perf harness scaffold in `src/dev/perf.ts`. |
| 6.7.5 | Filter changes apply within one frame (no spinner, no API round-trip) | **PASS (static signal)** | Filtering is fully client-side in `store/eventStore.ts` and `store/filters.ts`; chip/text input handlers in `FilterBar.ts` mutate `store.filters` signals directly. Search input debounces 120 ms (`TopBar.ts:72-79`, `FilterBar.ts` text inputs). No fetch on filter change. |
| 6.7.6 | Body-search highlight across 500 events < 50 ms | **unverified — requires runtime** | Static: text-search lives in `store/filters.ts` `textQuery`; highlight rendering not located in static review. |
| 6.7.7 | No external network requests at runtime | **PASS** | All `fetch()` calls go to the device server at `${scheme}://${host}/api/*` (`websocketSource.ts:76, 83, 169`). Fonts are self-hosted via `@font-face` URL `../assets/fonts/*.woff2` (`globals.css:14-56`). Icons are inline SVG built in JS (`src/design/icons.ts`). No `cdn.`, `googleapis`, `fonts.google`, `jsdelivr`, `unpkg` strings anywhere in `src/` or `index.html`. The only `https://` strings in code are XML namespace `http://www.w3.org/2000/svg` (`design/icons.ts:72`, `Primitives.ts:35`, `assets/logo-mark.svg:1`) and example/test URLs in `dev/`/`__tests__/`/fixtures (not shipped). |

## §5.6 Feature presence (MVP must-haves)

| Feature | Status | Location |
|---------|--------|----------|
| Top bar — device info | PRESENT | `TopBar.ts:34-37, 161-172` (app badge "pkg · version · device"). |
| Top bar — clear | PRESENT | `TopBar.ts:101-105` (icon button → `clearLocal` + `source.clear`). |
| Top bar — pause/resume | PRESENT | `TopBar.ts:97-100, 136-142` (icon swaps play↔pause). |
| Top bar — dark mode toggle | PRESENT | `TopBar.ts:106-108` (sun/moon swap). System-follow default in `eventStore.ts:79`. |
| Top bar — connection status | PRESENT | `TopBar.ts:40-44, 119-124`. Three-state pill driven by `source.connection`. |
| Virtualized event list with source badges, status colors, jump-to-latest | PRESENT | `EventList/virtual.ts` virtualization; `Row.ts` (badges, status pills); `EventList.ts` jump-to-latest pill. |
| Filter bar — source multi-select | PRESENT | `FilterBar.ts:46-64` (HTTP/LOG/CUSTOM chips, left=toggle, right=only-this). |
| Filter bar — HTTP method/status | PRESENT | `FilterBar.ts:73-90` methods; status chips below. |
| Filter bar — log level/tag | PRESENT | `FilterBar.ts` (level chips and `tagQuery`). |
| Filter bar — host/url contains | PRESENT | `store/filters.ts` `hostQuery`/`textQuery`; FilterBar text inputs. |
| Event detail HTTP tabs Headers / Request / Response / Timing / Related Logs / Raw + Copy as cURL | PRESENT | `EventDetail/tabs/HttpTabs.ts:15` `HTTP_TABS = ['Headers','Request','Response','Timing','Related Logs','Raw']`. Copy-as-cURL: `HttpTabs.ts:217-228` button + `input/keyboard.ts:209-220` builder + ⌘C shortcut. |
| Event detail LOG tabs Message / Payload / Stack Trace / Raw | PRESENT | `EventDetail/tabs/LogTabs.ts`. |
| Event detail CUSTOM tabs Payload / Metadata / Raw (Phase 3 scaffold) | PRESENT | `EventDetail/tabs/CustomTabs.ts:4` `CUSTOM_TABS = ['Payload','Metadata','Raw']`. |
| Body viewer states: JSON tree, plain text, image, hex, empty, truncated banner | PRESENT | `BodyViewer.ts:8` `BodyMode = 'auto'\|'json'\|'text'\|'image'\|'hex'\|'empty'`; truncation banner at line 64-76. |
| Waterfall view with shared time axis | PRESENT | `Waterfall.ts` — canvas-based, `BASE_MS_PER_PX` time scale, axis row at top, zoom in/out controls. |
| Split view list + waterfall | PRESENT | `SplitView.ts` (55 LOC); also drives detail pane in non-waterfall views. |
| Dark mode (system-follow + toggle) | PRESENT | `eventStore.ts:79` reads `prefers-color-scheme: dark`; `TopBar.ts:106-108` toggle; `globals.css:359-407` dark theme. |
| Empty / connection states | PRESENT | See 6.6.6 above. |
| Keyboard shortcuts | PRESENT (with `x` divergence) | `input/keyboard.ts:36-53`. See 6.6.7. |

## §5.7 Out-of-MVP features (flag if present)

| Feature | Status | Notes |
|---------|--------|-------|
| HAR export | NOT PRESENT | grep for `HAR\|har\.` returns nothing in code. |
| HAR replay | NOT PRESENT | — |
| Request replay | NOT PRESENT | — |
| Request blocking / mocking / throttling | NOT PRESENT | grep clean. |
| Breakpoints | NOT PRESENT | — |
| WS frame inspection (inspected app's outbound WS) | NOT PRESENT | — |
| Multi-device single-tab | NOT PRESENT | `?device=` is single-target. |
| Persistence across app restarts | NOT PRESENT (events) / PRESENT-but-acceptable (UI prefs) | `store/persistence.ts` wraps `localStorage`. Persisted keys: `view`, `theme`, `density`, `showCorrelationId`, `detailTab`, `filters.sourceLabels` (`eventStore.ts:78-90, 143-153`). **Events themselves are not persisted.** This matches the spirit of §5.7 (no replay across restarts of the captured stream). UI-pref persistence is implicitly OK and consistent with the design system's stickiness expectations. |
| Full-body download for truncated bodies | **PRESENT — flag** | `BodyViewer.ts:64-76` renders a truncation banner with a "**Load full body**" button calling `onLoadFull` (no caller wires it today, so the button is decorative). §5.7 explicitly drops "Full-body download for truncated". Either remove the button or stop calling it that — the truncation banner alone is fine. |
| Phased waterfall (DNS / Connect / TLS / Send / Wait / Receive) | **PARTIAL — flag** | `Waterfall.ts:328-337` and `EventDetail/tabs/HttpTabs.ts:148-167` (Timing tab) split each HTTP bar into three segments — `Connect (15%) / Wait (55%) / Download (30%)` — using **hardcoded fixed weights**, not real phase data. This is a visual stand-in. §5.7 forbids "Phased waterfall (DNS / Connect / TLS / Send / Wait / Receive breakdown)". The 3-segment fake doesn't include DNS/TLS/Send and isn't data-driven, but the visual still implies phase information that isn't there. Recommendation: render a single status-tinted bar per request until real timing data exists, or label the segments as illustrative. |
| Exact request/log correlation | NOT PRESENT | `HttpTabs.ts:191-193` uses ±500 ms heuristic per spec. |
| mDNS / Bonjour discovery | NOT PRESENT | UI accepts `?device=host:port` directly. |
| QR codes for device URL | NOT PRESENT | grep clean. |

## docs/design/ inventory

What's expected per §3.9 / §6.6.1 vs what exists:

| Required artifact | Exists? | Where |
|---|---|---|
| `docs/design/mockups/` (every screen state) | **NO at the canonical path** | `docs/ui/*.png` has 4 mockups (hero, event-list, filters, waterfall) — populated states only; no empty/error/disconnected mockups. |
| `docs/design/tokens.json` | **NO at the canonical path** | Token JSON lives at `argus-webui/src/design/tokens.json` (generated). The CSS source of truth is `design_handoff_argus_inspector/ds/colors_and_type.css`. |
| `docs/design/components/*` (per-component specs with all interaction states) | **NO** | Closest analog: `design_handoff_argus_inspector/argus/*.jsx` — JSX prototype files with implicit states (no markdown spec, no per-state matrix). |
| `docs/design/interactions.md` (incl. keyboard shortcuts) | **NO** | Keyboard shortcut spec is embedded in `design_handoff_argus_inspector/README.md` and the runtime `BINDINGS` array in `input/keyboard.ts:36-53`. No standalone interaction spec / motion-token cross-reference doc. |
| `docs/design/` single-page design system overview | **NO** | `design_handoff_argus_inspector/README.md` covers shell anatomy, view layouts, and tokens overview, but it's not under `docs/design/`. |
| `tokens.json` derived theme | **YES** | `argus-webui/scripts/build-tokens.ts` parses CSS → `tokens.json`; `tailwind.config.ts` consumes it. |

**Stale or misplaced:**
- `design_handoff_argus_inspector/README.md:60` lists HTTP detail tabs as `Overview · Headers · Request · Response · Timing · cURL`, while the spec contract §5.6 (and the implementation) uses `Headers · Request · Response · Timing · Related Logs · Raw`. The handoff doc is older than the spec.
- `docs/ui/*.png` are detached from any markdown — no captions, no per-state inventory.

## Hex literal / px value scan

- **Hex outside Tailwind config / `tokens.json` / `globals.css` / `assets/`**: 0 matches (clean).
- **px outside exempt paths**: 5 matches —
  - `src/components/EmptyStates/WaitingForEvents.ts:17-18` — `icon.style.width = '40px'; icon.style.height = '40px'` (could move to a class with `w-10 h-10` or a token).
  - `src/components/FilterBar/SourceLabelDropdown.ts:33` — `text-[10px]` Tailwind arbitrary value.
  - `src/components/EventDetail/tabs/HttpTabs.ts:84` — `text-[10px]` arbitrary value (engine pill).
  - `src/components/EventList/Row.ts:181` — `text-[10px]` arbitrary value (header pill).
  - Comments in `SourceLabelDropdown.ts:17`, `ConnectionBanner.ts:6`, `Primitives.ts:93` reference px conceptually but lint strips comments.
- The `text-[10px]` and `9px`/`10px` values inside `globals.css` for `kbd` and source badges are functional sub-token sizes that the design system simply doesn't include in the formal `fontSize` scale. Either add them to `tokens.json` (e.g. `fontSize.xxs: 9px / 10px / 12px`) or accept them as a known token gap.
- `argus-webui/scripts/lint-tokens.ts` is wired and would catch new strays. The `package.json:13` `lint` script runs it.

## External network references

None at runtime. All scans clean:
- No `https://` to third-party domains in `src/` (only XML SVG namespace and example URLs in `dev/perf.ts`, `__tests__`, `fixtures`).
- No `cdn.`, `googleapis`, `fonts.google`, `jsdelivr`, `unpkg`.
- Fonts self-hosted via `@font-face` (`src/styles/globals.css:9-57` → `src/assets/fonts/*.woff2`).
- Icons inline-built in JS (`src/design/icons.ts` `createIcon()` constructs SVG via `document.createElementNS`).
- All transport calls (`websocketSource.ts:76, 83, 169` and `ws://` upgrade at line 38-40) target the device origin (`${scheme}://${host}`).

## Notes & risks

1. **Structural design-doc gap (§3.9 / §6.6.1).** The repo has functional design artifacts (handoff JSX, CSS tokens, runtime tokens.json, 4 mockup PNGs) but they are not under `docs/design/` and the required deliverables (`interactions.md`, per-component specs, design system overview, tokens.json) are not co-located. The implementation behaves as if these artifacts existed; reviewers of §6.6.1 will mark it failed against the literal contract. Recommend either creating `docs/design/` with the missing markdown specs or amending the spec to reference `design_handoff_argus_inspector/`.
2. **Mockup coverage is thin.** `docs/ui/` has populated-state-only mockups. Empty/loading/error/disconnected/reconnecting states are implemented but cannot be screenshot-compared.
3. **`x` shortcut divergence.** Spec §5.6 says `x` is "clear with confirm". Impl maps `x → clearFilters`, `Shift+X → clearEvents` with toast+undo (no confirm modal). Likely intentional UX upgrade; needs spec update.
4. **Phased-waterfall stand-in.** Three-segment hardcoded splits (Connect 15% / Wait 55% / Download 30%) in both `Waterfall.ts` and the Timing tab visually imply phase data the events don't carry. §5.7 forbids phased waterfall. Recommend a single tinted bar or a clearer "approximate" label until real phase data exists.
5. **"Load full body" button.** `BodyViewer.ts:72` exposes a button that §5.7 says was dropped. Currently no caller wires `onLoadFull`, so the button is dead but visible. Either delete or rename to "Copy preview".
6. **Bundle budget interpretation.** App JS+CSS gzipped is ~30 KB (well under 100 KB). With self-hosted fonts (~162 KB raw woff2), the total payload is ~190 KB — over budget if fonts count. The spec also mandates fonts be bundled (not CDN), which is an inherent tension. Worth clarifying.
7. **Sub-token sizes (9px / 10px) live as raw values in `globals.css` and as `text-[10px]` arbitrary Tailwind classes.** Pure-pedant view of §6.6.3: hand-picked spacing values exist, just inside the exempt zone. Adding `fontSize.xxs` to the token system would close the loophole.
8. **No persistence of events** (good); UI prefs are persisted in `localStorage` (`store/persistence.ts`), which is reasonable but worth calling out for §5.7 reviewers.
9. **Lint coverage** is solid — `lint-tokens.ts` will catch future strays.
10. **`docs/design/components/*` → `argus-webui/src/components/*` mapping** is 1:1 against the handoff bundle. No orphans, no missing implementations.
