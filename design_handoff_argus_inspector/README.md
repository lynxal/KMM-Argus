# Handoff: Argus Inspector

## Overview

Argus is a developer-tools inspector for HTTP traffic and application logs. It's a desktop-class, keyboard-driven UI — think "Charles Proxy × Chrome DevTools × a log viewer" — that ingests an event stream from an Argus server and lets developers filter, inspect, and diff requests, responses, log lines, and custom events in real time.

The design in this bundle covers the primary inspector surface and all its major states.

## About the Design Files

The HTML/JSX files in this bundle are **design references** — prototypes showing intended look and behavior, built with React + inline Babel for review purposes. **They are not production code to copy directly.**

Your task is to **recreate these designs in the target codebase's existing environment** using its established patterns, component libraries, and conventions. If no environment has been chosen yet, pick the most appropriate stack for a desktop-class developer tool (Tauri + React, Electron + React, SwiftUI, etc.) and implement there.

Treat the JSX as visual + behavioral spec, not as a module to lift wholesale. The `data.js` fixture is obviously throwaway — the real app wires to the Argus event stream.

## Fidelity

**High-fidelity (hifi).** Pixel-perfect mockups with final colors, typography, spacing, density, states, and interactions. All design tokens are defined in `ds/colors_and_type.css` and should be lifted verbatim (names + values). Recreate the UI pixel-perfectly.

## Screens / Views

All screens share the same shell. What changes is the content area.

### Shell anatomy (constant across views)

Top to bottom:

1. **TopBar** — 40 px tall, `bg-panel`, `border-default` bottom.
   - Left: 20 px logo mark (`ds/logo-mark.svg`), wordmark "Argus" (13 px Inter 600), version chip "1.0" (10 px mono, `bg-subtle`).
   - Center-left: connection pill (14 px dot + status text + last-seen timestamp). Three states:
     - `connected` — green dot (`--conn-ok-dot`), "Connected" text, `bg-subtle` pill
     - `reconnecting` — amber dot, pulsing (`argusPulse` keyframe, 1.2s)
     - `disconnected` — red dot
   - Center: view switcher — segmented control with three options (List / Split / Waterfall). Selected segment: `bg-panel`, subtle shadow, `fg-1`. Unselected: `fg-2`.
   - Right side (left-to-right): global search (`/` to focus, 240 px wide, monospace placeholder), pause button (toggles to resume icon when paused), clear button, theme toggle, help button (`?`).
2. **Connection banner** — only visible when `conn !== 'connected'`. 32 px tall, full-width, tinted by state (amber for reconnecting, red for disconnected). Contains icon, message, last-seen timestamp, retry countdown, "Retry now" button.
3. **FilterBar** — 36 px tall, `bg-panel`, `border-default` bottom.
   - Source toggles: HTTP / LOG / CUSTOM as filled chips. Active = source's tinted background; inactive = `bg-subtle` with muted text.
   - Method multi-select: GET/POST/PUT/PATCH/DELETE/OTHER — each rendered in the method's color when active.
   - Status class multi-select: 2xx/3xx/4xx/5xx/ERR — each a dot + label, tinted when active.
   - Log level multi-select: ERROR/WARN/INFO/DEBUG/VERB — tinted block pills.
   - Text filters: host-contains, tag-contains, text-contains (mono, 11 px).
   - Right side: result count `<shown> / <total>`, "Clear" link-button.
4. **Content area** — fills remaining height, 8 px padding, 8 px gap. Panels are `bg-panel`, `border-default`, 6 px radius.
5. **Status bar** — 24 px tall, `bg-panel`, `border-default` top. Left: event count + paused indicator. Right: inline shortcut hints (each key wrapped in `<kbd>`).

### View: Split (default)

Two panels, 50/50 split.

- **Left: EventList.** Single column, each row 28 px (compact) or 32 px (comfy).
  - Row layout: `[SrcBadge] [method or LEVEL] [status pill or —] [primary text, ellipsized] [meta: duration or timestamp]`.
  - Primary text: host in `fg-3`, path in `fg-1` (for HTTP); message in `fg-1` with `[tag]` in `fg-3` (for LOG); event name for CUSTOM.
  - Selection: `bg-selected-kb` + 2 px left rail in `border-focus` when selected via keyboard; `bg-selected` without the rail when selected via mouse.
  - Hover (mouse, non-selected): `bg-subtle`.
  - Dividers: 1 px `border-subtle` between rows.
  - Jump-to-latest pill appears bottom-center when new events arrive while scrolled up.
- **Right: EventDetail.** Tabbed view at the top, content below.
  - Tabs (HTTP): Overview · Headers · Request · Response · Timing · cURL. (LOG): Overview · Context · Stack. (CUSTOM): Overview · Payload.
  - Overview: large title (method + path or event name), status pill, host + timestamp, grid of KV pairs (12 px labels in `fg-3`, 13 px mono values in `fg-1`).
  - Headers: two-column table, 28 px rows, mono, header name in `fg-2`, value in `fg-1`.
  - Request/Response: BodyViewer (see below).
  - Timing: horizontal stacked bar — DNS / Connect / TLS / Wait / Download segments with their own tints, ms labels under each.
  - cURL: syntax-highlighted single-string block, "Copy" button top-right.

### View: Waterfall

Narrow EventList on left (~34 %), Waterfall panel on right.

- **Waterfall panel:**
  - Header: 28 px tall. Left: "Event" column label + count. Center: time axis with 5 tick marks (0, 25%, 50%, 75%, 100%) labeled in ms at current zoom. Right: zoom in/out buttons + current zoom factor (mono).
  - Body: one row per event, 28 px tall, synced selection with the list.
    - Row: `[SrcBadge] [method/level] [label]` in a 240 px fixed gutter.
    - Track: fills remaining width. For HTTP, three stacked segments — Connect (gray), Wait (amber-ish), Download (status-tinted). For errored requests, dashed red outline bar. For LOG/CUSTOM, a 2 px vertical tick at the event timestamp in the source's color.
    - Duration column on the far right, 70 px wide, mono.

### View: List only

Same as Split's left panel, but full width. Slightly denser columns; status pill is always visible. Used when a user wants to scan a long stream without the detail pane.

### State: Empty ("Waiting for events")

Split layout, but instead of EventList + Detail, a single centered message card:

- SVG "radar" glyph (40 px), `fg-muted`.
- Headline: "Waiting for events" (15 px Inter 600).
- Body: "Argus is listening on `192.168.1.42:9090`. Make a request from your app to see it here." (12 px, `fg-2`, with the address in a mono inline code chip).
- Two buttons: "Copy address" (primary) + "Docs" (ghost).
- Subtext: "Press `?` for shortcuts."

### State: Reconnecting / Disconnected

Shell visible but grayscale-feeling. The connection banner is visible. The event list freezes at the last-known state (don't clear it). Top-bar connection pill reflects state.

### Overlay: Filter popover

300 px wide, anchored below the "Add filter" button in the FilterBar. Floats above content with `shadow-md` and 1 px `border-default`.

Sections: "Add filter" header with close X · field search input · "Method" checkbox grid (2 cols) · "Status class" checkbox grid · footer with "Reset" (ghost) + "Apply" (primary w/ `↵` kbd hint).

### Overlay: Shortcuts help modal

560 px wide, centered. Scrim: `rgba(20,22,24,0.35)`.

Two-column grid of sections (Navigate / Search & filter / Capture / Views / Help). Each row: action label + key chord using `<kbd>`.

### Toast

Bottom-center, 32 px tall, `bg-overlay`, `shadow-md`, `border-default`, 6 px radius. Check icon (in `--conn-ok-fg`) + message + undo hint (`⌘ Z`). Auto-dismiss after ~3s. Used for: "Copied as cURL", "Copied request body", "Filter cleared", etc.

### Body viewer variants

The BodyViewer lives in the Request/Response tabs but also appears in LOG context and CUSTOM payload tabs. Toolbar at the top (24 px): format badge (JSON/TEXT/IMAGE/HEX/EMPTY) · size · mime type · wrap toggle · copy button · download button.

- **JSON tree**: collapsible tree with disclosure arrows. Keys in `fg-1`, strings in green-ish (`--json-string`), numbers in blue-ish (`--json-number`), booleans/null in purple-ish (`--json-bool`). Hover shows path breadcrumb at bottom.
- **JSON truncated**: same as above but with a dashed divider and a "Body truncated at 512 KB — Load full body" chip. Keeps the viewer responsive.
- **Plain text**: monospace, 12 px, word-wrap toggle respected.
- **Image**: centered preview with checkerboard transparency background, meta footer (name · mime · dimensions · size).
- **Hex / ASCII**: 16-byte columns with offset gutter (mono, `fg-3` offset, `fg-1` hex, `fg-2` ASCII).
- **Empty**: small centered "No body" placeholder.

## Interactions & Behavior

### Keyboard-first navigation

All of these should work when focus is anywhere except inside a text input:

| Shortcut | Action |
| --- | --- |
| `/` | Focus global search |
| `j` / `k` | Next / prev event in list (scroll into view, smooth) |
| `↑` / `↓` | Same as `k` / `j` |
| `⎋` (Esc) | Close overlay; if none, clear search; if none, deselect |
| `f` | Open Add filter popover |
| `x` | Clear all active filters |
| `p` | Toggle pause |
| `Shift+X` | Clear events (with undo toast) |
| `w` | Cycle view: List → Split → Waterfall → List |
| `[` / `]` | Prev / next tab within detail |
| `?` | Open shortcuts modal |
| `⌘C` / `Ctrl+C` | Copy currently selected event as cURL (HTTP) or JSON (other) |
| `⌘Z` | Undo the last destructive action (clear, delete filter) |

Selection style differs by input source:

- **Keyboard selection** → `bg-selected-kb` background + 2 px `border-focus` left rail
- **Mouse selection** → `bg-selected` background, no rail

This distinction is intentional — the keyboard rail tells power users where focus lives; the mouse bg is softer.

### Live streaming behavior

- New events append to the top (newest first) OR bottom (oldest first) based on a setting. Default: newest first.
- When user has scrolled away from the head, show a "Jump to latest · N new" pill bottom-center of the list. Click or `g` to snap back.
- When paused: new events buffer but don't render. TopBar shows a pulsing amber dot and an "N buffered" chip. Resuming flushes in order.

### Filter interactions

- Source chips: single click toggles. All three on by default.
- Method/status/level chips: click toggles, right-click / long-press for "only this" (deselects siblings).
- Text inputs: filter as the user types, 120 ms debounce. Matched substrings highlight in the list with `bg-highlight`.

### Animations & transitions

- View switch: 160 ms ease-out crossfade of content panels.
- Tab switch within detail: 120 ms.
- Overlay open (popover, modal): 140 ms scale from 0.98 + fade.
- New-event row append: 200 ms background flash from `bg-selected` → transparent.
- Reconnecting dot: 1.2 s pulse.
- Toast enter/exit: 180 ms slide-up + fade.

### Responsive / resize behavior

Designed for 1280 px width minimum. Panels in Split view are resizable via a 1 px divider (hover: widens to 3 px + cursor). Below 960 px, collapse Split → List and push detail into a right-side drawer.

## State Management

The inspector is effectively a stream-backed store. Minimum state:

- `events: Event[]` — bounded ring buffer, default cap 10 000. Configurable.
- `selectedId: string | null`
- `selectionSource: 'keyboard' | 'mouse'`
- `view: 'list' | 'split' | 'waterfall'`
- `paused: boolean` + `pausedBuffer: Event[]`
- `connection: 'connected' | 'reconnecting' | 'disconnected'` + `lastSeenAt`, `retryAt`
- `filters: { sources, methods, statuses, levels, tagQuery, hostQuery, textQuery }`
- `theme: 'light' | 'dark'` — persisted to local config
- `density: 'compact' | 'comfy'` — persisted
- `detailTab: string` — per event type, last-used tab remembered
- `overlays: { filter: bool, shortcuts: bool, toast: {msg, icon} | null }`

Transitions:

- Event stream → dispatcher filters by paused state → push to `events` (or `pausedBuffer`) → re-run derived filter set.
- Selection change: if user pressed a nav key set `selectionSource='keyboard'`; click sets it to `mouse`.
- Connection events: server heartbeat gap > 3 s → `reconnecting`; gap > 15 s → `disconnected`.

Data fetching: subscribe to Argus server via WebSocket (assumed contract — coordinate with backend). Event payload schema matches `Event` in `argus/data.js`.

## Design Tokens

All tokens are in `ds/colors_and_type.css` and declared as CSS custom properties. Both light and dark themes are defined on `.theme-light` and `.theme-dark` selectors so you can scope theme switching to any ancestor.

**Surfaces (light):** `--bg-app`, `--bg-panel`, `--bg-subtle`, `--bg-sunken`, `--bg-overlay`, `--bg-selected`, `--bg-selected-kb`.

**Foregrounds:** `--fg-1`, `--fg-2`, `--fg-3`, `--fg-muted`, `--fg-on-accent`.

**Borders:** `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus`.

**Accent:** `--accent-bg`, `--accent-subtle`, `--accent-border`.

**Status (HTTP classes):** `--status-{2xx,3xx,4xx,5xx,err}-{bg,fg,dot}`.

**Log levels:** `--log-{error,warn,info,debug,verb}-{bg,fg}`.

**Methods:** `--method-{get,post,put,patch,delete,other}-fg`.

**Sources:** `--src-{http,log,custom}-{bg,fg}`.

**Waterfall segments:** `--wf-connect`, `--wf-wait`, `--wf-download` (resolves via `statusTone().dot`).

**JSON syntax:** `--json-{string,number,bool,key}`.

**Connection:** `--conn-{ok,warn,err}-{bg,fg,dot}`.

**Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-focus`.

**Typography:**

- UI: Inter (400/500/600). Sizes: 10 (eyebrow caps, tracked `0.04em`), 11 (meta), 12 (body — default), 13 (h3), 15 (h2), 18 (h1). Line heights: 1.4 – 1.5.
- Mono: JetBrains Mono (400/500/600/700). Used for all request/response content, values, timestamps, shortcuts, IDs. Sizes: 10, 11, 12.

**Spacing:** 4 px base. Scale in use: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64.

**Radii:** 2, 3, 4, 6, 8.

**Density:** Compact row = 28 px. Comfy row = 32 px. Status-bar row = 24 px. TopBar = 40 px. FilterBar = 36 px.

## Assets

- `ds/colors_and_type.css` — design tokens + global typography classes (`ds-h1`, `ds-h2`, etc.).
- `ds/logo-mark.svg` — Argus logomark (radar-dish glyph). Use as the app icon.
- `ds/fonts/` — Inter and JetBrains Mono woff2 bundles. License: both SIL OFL 1.1. Ship with the app.

No other imagery is used — all icons are inline SVG, defined in `argus/Primitives.jsx` (`<Icon name="..."/>`). Port these as a simple icon component in the target codebase.

## Files in this handoff

- `Argus Inspector.html` — the canvas showing every screen, state, and the design-system sheet. Open this in a browser to see everything.
- `argus/*.jsx` — design source for each region of the UI:
  - `Primitives.jsx` — `Icon`, `Kbd`, `SrcBadge`, helpers (`statusTone`, `logTone`, `methodColor`).
  - `TopBar.jsx`, `FilterBar.jsx`, `EventList.jsx`, `EventDetail.jsx`, `BodyViewer.jsx`, `Waterfall.jsx`, `Overlays.jsx`, `Inspector.jsx`.
- `argus/data.js` — fixture event data (throwaway; use for visual reference only).
- `ds/` — design tokens + fonts + logo.

## Implementation tips

- **Start with the tokens.** Port `colors_and_type.css` first (or its equivalent in your framework's token system) so everything downstream stays consistent.
- **Build `SrcBadge`, `Kbd`, and `Icon` early.** They appear in nearly every view.
- **The event row is the atom of the whole UI** — getting its layout, typography, and selection states exactly right unlocks the list, waterfall gutter, and log detail simultaneously.
- **Don't skip the keyboard/mouse selection distinction.** It's subtle visually but matters a lot to the feel.
- **Model the filter state as a single `filters` object** and pipe all predicates through one `applyFilters(events, filters)` function — makes testing and the "clear all" action trivial.
- **The Waterfall time axis should be derived from visible events**, not fixed — zoom-out lets long traces fit; zoom-in magnifies a cluster.
