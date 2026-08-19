# Fold #1 + #2 — export all events, download raw payloads

## Context

Two open `enhancement` issues on `lynxal/KMM-Argus` ask for the same missing capability from two
angles: there is no way to get data out of the Web UI.

- **#1 "Web UI: export all logs to a file"** — the only bulk action in the top bar is Clear
  (`TopBar.ts:101-105`). Anything a developer wants to keep — attach to a ticket, diff against
  another run, hand to a teammate — has to be re-read off the screen.
- **#2 "Web UI: download/copy the payload shown in raw mode"** — the Raw tab renders the whole event
  as pretty-printed JSON through `BodyViewer` and it is read-only. Selecting a long payload by hand
  in a scrolling pane is unreliable.

They fold into one change because they need the same thing that does not exist yet: **a
`Blob` + `<a download>` helper.** Confirmed by exhaustive grep — `argus-webui/src` contains no
`Blob`, no `createObjectURL`, no `<a download>`, and no clipboard util. #2 says so itself: "worth
extracting one small `downloadFile(name, mime, data)` helper and using it in both places."

Branch state: `vkurkchi/web-ui-export-all-logs-to-a-file` is at `443e9fe`, **identical to
`origin/main`** (`git rev-list --left-right --count origin/main...HEAD` → `0 0`). Nothing to rebase.

Outcome: one textual **Export** CTA in the top bar writes every captured event to a JSON file, and a
textual **Download** button in the `BodyViewer` toolbar saves whatever payload is on screen — the Log
Raw tab, the HTTP Raw / Request / Response bodies, and the Custom payload.

### Decisions taken during shaping

- **Textual buttons, not icon buttons** — user's call. This deviates from
  `design_handoff_argus_inspector/argus/BodyViewer.jsx:19-20`, which specifies 12 px `copy` /
  `download` icon buttons, so the handoff is updated in the same change (Task 7) rather than left
  contradicting the code. The `download` icon in `icons.ts:23` therefore stays unused.
- **Export is unfiltered ("all")** — one button, no dropdown, no filtered variant. #1 offered "a
  plain export all if we want to keep it simple for a first cut"; that is what we ship.
- **Download only, no Copy** — #2 asked for both; the user asked for download. `⌘C` already copies
  the selected event as JSON (`keyboard.ts:160-175`) and "Copy as cURL" covers requests
  (`HttpTabs.ts:217-229`), so the copy gap is much smaller than the download gap. Assumption stated
  rather than blocking on it.
- **Format: a JSON envelope, `events` as an array of `ArgusEvent`.** #1 asked for "NDJSON or a single
  JSON array". Wrapping the array in `{ argusSchemaVersion, exportedAt, device, eventCount, events }`
  costs nothing (`jq '.events[]'` still works, and re-ingesting `.events` still round-trips) and
  makes a file attached to a ticket self-describing — which device, which app version, which schema.
  Flag: this is a deliberate deviation from the issue text; say so and drop the envelope if unwanted.
- **Chronological order in the file.** `store.events` is newest-first (`eventStore.ts:157` prepends);
  the export reverses to oldest-first, which reads like a log file. Re-ingest still lands newest-first
  because `ingest` prepends.
- **Paused buffer excluded.** `store.pausedBuffer` holds events captured while paused and is not part
  of `store.events` until `resume()` (`eventStore.ts:168-181`). #1's own open question suggests
  "visible set only, to match what the user sees" — followed.
- **A truncated body downloads, with the truncation stated.** The cap is applied at capture inside
  the library (`argus-core/.../BodyEncoding.kt:30-38`) and only `bodyPreview` +
  `bodyTruncatedTotalBytes` ever reach the browser — the missing bytes do not exist client-side, so
  "download the full payload" is impossible without the Phase 2 roadmap item ("Full-body download for
  responses that were truncated during capture"). So: button stays enabled, filename gains a
  `-truncated` marker, and the toast names both byte counts. Nothing half-complete can be mistaken
  for whole.
- **`⌘E` is out of scope.** #1 calls it a follow-up; keeping it out keeps the shortcut table
  untouched.
- **No new devDependency, no DOM test.** argus-webui's vitest runs in the default `node` environment
  with no jsdom (no `test` block in `vite.config.ts`, jsdom absent from `package.json`). The new
  module is split so every decision — envelope, filename, extension, base64 decode — lives in pure
  functions that *are* unit-testable, and only `downloadFile` touches the DOM. This mirrors the
  established `*.states.ts` pattern (`ConnectionBanner.states.test.ts`).
- **No version bump** — deferred until fixes accumulate, per the precedent in
  `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`.

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-08-19-1754-webui-export-and-raw-download/`:

- `plan.md` — copy of this plan.
- `shape.md` — scope, the decisions above with their reasons, and the two deviations (handoff icon →
  text button; issue's bare array → envelope).
- `references.md` — the files touched, plus the prior art actually reused:
  `SourceLabelDropdown.ts` (rejected — no dropdown needed after all), `TopBar.styles.ts` (button
  class conventions), `ConnectionBanner.states.ts` + its test (pure-logic-beside-DOM-component
  pattern), and `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/` (the handoff-deviation
  precedent).
- No `visuals/` — none provided.
- No `standards.md`. `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured; nothing in it
  governs the webui DOM layer. Only `workflow/commit-conventions` applies, as it does to every commit.

## Task 2 — The shared download module (new: `argus-webui/src/export/exportFile.ts`)

The whole point of folding the issues. Pure functions first, DOM last.

```ts
/** Pretty-printed envelope written to the bulk export file. Pure. */
export function buildEventsExport(
  events: readonly ArgusEvent[],
  device: DeviceInfo | null,
  exportedAt: number,
): string;

/** `argus-<pkg>-<yyyyMMdd-HHmmss>.json`, falling back to `argus-events-…` with no device. Pure. */
export function eventsFileName(device: DeviceInfo | null, at: number): string;

/** Base name + `-truncated` marker + an extension matching the resolved mode. Pure. */
export function bodyFileName(
  base: string,
  mode: BodyMode,
  contentType: string | null,
  truncated: boolean,
): string;

/** Chooses text vs bytes so `image` mode ships the original bytes, not the rendered view. Pure. */
export function bodyDownloadPayload(
  body: string,
  mode: BodyMode,
  contentType: string | null,
): { mime: string; data: string | Uint8Array };

/** Blob + createObjectURL + synthetic `<a download>` click, then revokeObjectURL. DOM. */
export function downloadFile(fileName: string, mime: string, data: string | Uint8Array): void;
```

Details that matter:

- `buildEventsExport` — `JSON.stringify({ argusSchemaVersion: ARGUS_SCHEMA_VERSION, exportedAt: new
  Date(exportedAt).toISOString(), device, eventCount, events: [...events].reverse() }, null, 2)`.
  `ARGUS_SCHEMA_VERSION` is already exported (`schema.ts:9`); reuse it, do not hardcode `2`.
- `eventsFileName` — `d.pkg` from `source.device.value` (`DeviceInfo.pkg`, `schema.ts:144`), local-time
  `yyyyMMdd-HHmmss`. Run every name segment through one shared `safeSegment()` that replaces
  anything outside `[A-Za-z0-9._-]` with `-` — event ids and package names both go through it.
- `bodyFileName` extensions: `json → .json`, `text → .txt`, `hex → .bin`, `image → .png/.jpg/.gif/
  .webp` from the `contentType` subtype and `.bin` otherwise. `mode` is already resolved by
  `inferMode` before the toolbar exists (`BodyViewer.ts:26`), so no re-inference here.
- `bodyDownloadPayload` — for `image`, strip a `data:…;base64,` prefix if present (the caller may pass
  either form, `BodyViewer.ts:103-104`) and `atob` → `Uint8Array` so the file is a real image, not
  base64 text. Every other mode returns the string verbatim, with mime from `contentType` or a mode
  default. Note `hex` needs no special case: `renderHex` already hexdumps
  `new TextEncoder().encode(body)` (`BodyViewer.ts:110`), i.e. the UTF-8 bytes of the same string a
  text download writes.
- `downloadFile` — the only DOM-touching export. `new Blob([data], { type: mime })`, `a.href = URL
  .createObjectURL(blob)`, `a.download = fileName`, `a.click()`, then `URL.revokeObjectURL` in a
  `setTimeout(…, 0)` so Safari does not cancel the download. Never called from tests.

## Task 3 — Unit-test the pure half (new: `argus-webui/src/export/__tests__/exportFile.test.ts`)

Vitest, node env, no DOM. Cover exactly the decisions that could silently regress:

- Envelope shape: `argusSchemaVersion` tracks `ARGUS_SCHEMA_VERSION`, `eventCount` matches
  `events.length`, and the events come out **oldest-first** given a newest-first input.
- `device: null` → still valid JSON, `eventsFileName` falls back to `argus-events-…`.
- `eventsFileName` sanitises a package name and matches `/^argus-.+-\d{8}-\d{6}\.json$/`.
- `bodyFileName`: extension per mode, `image/jpeg → .jpg`, and `truncated: true` inserting
  `-truncated` before the extension.
- `bodyDownloadPayload`: bare base64 and `data:` prefixed both decode to the same bytes; a JSON body
  passes through untouched with `application/json`.

Reuse the event shapes from `src/dev/fixtures/events.ts` if they import cleanly under node; otherwise
inline minimal literals like `filters.test.ts` does.

## Task 4 — Export CTA in the top bar (`argus-webui/src/components/TopBar/TopBar.ts`, `TopBar.styles.ts`)

- Add one style key next to `iconBtn` (`TopBar.styles.ts:16`):

```ts
textBtn: 'flex items-center px-2 h-6 rounded-sm bg-bg-subtle text-fg-1 text-xs font-ui hover:bg-bg-active transition-colors duration-base cursor-pointer',
```

  Same token vocabulary as the existing "Copy as cURL" button (`HttpTabs.ts:220`) so the two textual
  buttons in the app match. Tailwind utilities only — `scripts/lint-tokens.ts` fails the build on a
  raw hex or `px` literal.

- Build the button beside the existing `iconBtn` factory (`TopBar.ts:82-95`) and insert it into the
  append order (`TopBar.ts:116`) between `search` and `corrIdBtn`:

```ts
bar.append(brand, connPill, viewSwitcher, spacer, search, exportBtn, corrIdBtn, pauseBtn, clearBtn, themeBtn, helpBtn);
```

- Click handler — all events, unfiltered, empty-guarded, toasted the same way Clear is
  (`TopBar.ts:104`):

```ts
const events = store.events.value;
if (events.length === 0) {
  bus.toast.value = { msg: 'No events to export', at: Date.now() };
  return;
}
const at = Date.now();
const name = eventsFileName(source.device.value, at);
try {
  downloadFile(name, 'application/json', buildEventsExport(events, source.device.value, at));
  bus.toast.value = { msg: `Exported ${events.length} events · ${name}`, at };
} catch {
  bus.toast.value = { msg: 'Export failed', at };
}
```

  `source.device` is already read by the app-badge effect (`TopBar.ts:161-171`), so no new prop.

- Keep an `aria-label` and `title` (`Export all events as JSON`) as every other top-bar button does.

## Task 5 — Download button in the BodyViewer toolbar (`argus-webui/src/components/BodyViewer/BodyViewer.ts`)

Two new props (both need an explicit `| undefined` — `tsconfig.json` sets
`exactOptionalPropertyTypes: true`):

```ts
readonly downloadName?: string | undefined;  // base name, no extension
readonly bus?: ShortcutBus | undefined;      // for the toast; omit and the button stays silent
```

In the toolbar block (`BodyViewer.ts:34-52`), after the badge / size / contentType spans and only
when `p.downloadName` is set, append a right-aligned textual button:

- `className` = the same string as `TopBar.styles.textBtn`, plus `ml-auto` — the toolbar is a plain
  `flex` row with no spacer today, so `ml-auto` is what pushes the group right. Text `Download`.
- Handler computes `truncated = !!p.truncatedTotalBytes && p.truncatedTotalBytes > (p.sizeBytes ?? 0)`
  — the exact condition the banner already uses (`BodyViewer.ts:63`) — then
  `bodyFileName` / `bodyDownloadPayload` / `downloadFile`, and toasts via `p.bus`:
  - normal: `Downloaded <fileName>`
  - truncated: `Downloaded <sizeBytes> of <truncatedTotalBytes> B — body was truncated at capture`
  - throw: `Download failed`
- Set `title` to the same truncation warning so it is visible before clicking, not only after.

Deliberately unchanged: the two early returns for an empty body (`BodyViewer.ts:22-25`, `:29-32`)
return before the toolbar exists, so "No body" shows no Download button. Correct — there is nothing
to download.

Importing `ShortcutBus` from `../../input/keyboard` puts a components→input edge in place;
`HttpTabs.ts:9` already imports `buildCurl` from there, so the direction is established.

## Task 6 — Thread `bus` and `downloadName` to the six call sites

`createEventDetail` already receives `bus` (`EventDetail.ts:16`) and drops it before the tabs. Add
`readonly bus: ShortcutBus` to `HttpTabsProps` / `LogTabsProps` / `CustomTabsProps` and pass it at
`EventDetail.ts:71-73`. Then each `createBodyViewer` call gains `bus` and a `downloadName`:

| Call site | `downloadName` |
| --- | --- |
| `HttpTabs.ts:36` Request body | `argus-http-${event.id}-request` |
| `HttpTabs.ts:48` Response body | `argus-http-${event.id}-response` |
| `HttpTabs.ts:67` Raw | `argus-http-${event.id}-raw` |
| `LogTabs.ts:62` Raw | `argus-log-${event.id}-raw` |
| `CustomTabs.ts:26` Payload | `argus-custom-${event.id}-payload` |
| `CustomTabs.ts:52` Raw | `argus-custom-${event.id}-raw` |

Ids are sanitised inside `bodyFileName`, so pass them raw. This covers the user's ask (Log raw,
network request/response) and the rest of #2's ask ("so it applies wherever `BodyViewer` is used")
in one edit, because the button lives in the shared component.

## Task 7 — Reconcile the design handoff (`design_handoff_argus_inspector/`)

The handoff is the design source of truth and currently disagrees with what we are shipping in two
places. Fix both so the two do not silently drift:

- `argus/BodyViewer.jsx:19-20` — replace the two 12 px icon buttons with a single textual
  `Download` button using `bv.smallBtn` (already defined and used for `Expand all` / `Wrap`). Leave
  the truncated banner's `Request full` chip alone — that is the Phase 2 roadmap item, not this
  change.
- `README.md:114` — the toolbar line currently reads "… wrap toggle · copy button · download button";
  restate it as a textual Download button, and note that Copy is served by `⌘C` and "Copy as cURL"
  instead.
- `README.md:36` — the TopBar right-side ordering list gains the Export CTA between global search and
  the pause button. `argus/TopBar.jsx` gains the matching button next to the clear button
  (`TopBar.jsx:47`).

Do not touch `ds/colors_and_type.css` — no token changes.

---

## Verification

`cd argus-webui` for all of it.

```bash
npm ci
npm run lint      # tsc --noEmit + token lint — catches a raw hex/px in the new class strings
npm test          # new exportFile suite + the 5 existing suites must all be green
npm run dev       # http://localhost:5173/?simulate=off  → mock stream, no device needed
```

`?simulate=off` forces `createMockSource` (`app.ts:22-38`) so the fixture stream replays without a
device; `FIXTURE_DEVICE` (`src/dev/fixtures/events.ts:198`) supplies `com.example.app` / `Pixel 8`,
which is what the export filename should reflect.

Headless DOM check, per the project's established method — scratchpad `playwright-core` against the
dev server, launching the context with `acceptDownloads: true` and asserting on the `download` event
(`suggestedFilename()` and the saved file's contents). Two flows worth automating: the top-bar Export,
and Download on an HTTP Response body.

Manual pass in the browser, both themes:

1. **Export with no events** (immediately after Clear) → toast "No events to export", no file written.
2. **Export with events** → file lands as `argus-com.example.app-<yyyyMMdd-HHmmss>.json`; toast names
   the count. Open it: envelope keys present, `eventCount` matches, `events` **oldest-first**, and
   `jq '.events | length'` agrees.
3. **Export while a filter or search is active** → the file still holds every event, not the filtered
   subset (this is the "all" decision; the count in the toast will exceed the row count on screen).
4. **Export while paused** → the file holds `store.events` only; events captured during the pause
   appear after Resume and land in a subsequent export.
5. **Log Raw tab → Download** → `argus-log-<id>-raw.json`, byte-identical to what the pane shows.
6. **HTTP Raw / Request / Response → Download** → three distinct filenames, right payload in each.
   Request/Response with no body → no Download button (the "No body" card).
7. **A truncated response body** → banner visible, filename carries `-truncated`, toast names both
   byte counts, and the file matches `bodyPreview` exactly. Reproduce by lowering `maxBodyBytes` in
   the sample app, or by hand-editing a fixture in `src/dev/fixtures/events.ts`.
8. **An image response** → the downloaded file opens as an image (bytes, not base64 text).
9. **Custom Payload / Raw → Download** → correct names and extensions.
10. Re-import check: paste the exported `.events` array back through the mock source (or `jq` it into
    a fixture) and confirm the UI renders it — this is the round-trip #1 asked for.

Closing evidence: the exported JSON and one downloaded raw payload attached to issues #1 and #2.


---

# Review follow-up (same branch, second commit)

Three items raised after the first commit landed.

## 1. Export offers both scopes

The single unfiltered button becomes a menu with **Export all** and **Export filtered**, each labelled
with its live count and disabled when its set is empty. New `argus-webui/src/components/TopBar/
ExportMenu.ts`, mirroring `FilterBar/SourceLabelDropdown.ts` — portaled to `document.body`,
`position: fixed`, repositioned on scroll/resize, dismissed by click-outside and Escape, right-aligned
to the trigger. "Filtered" exports `store.filteredEvents`, i.e. exactly the visible rows. Toast
distinguishes the two ("Exported 2 filtered events · …").

## 2. "Copy as cURL" did not work — root cause and fix

Measured, not guessed. `navigator.clipboard` is gated on `isSecureContext`; the device serves the UI
over plain http on a LAN IP, where the object is `undefined`, so `.writeText` throws **synchronously**
and the `.catch(() => undefined)` on the promise chain never runs:

| origin | isSecureContext | navigator.clipboard | click result |
| --- | --- | --- | --- |
| `http://localhost:5173` (dev) | true | object | copies, but no toast ever fired |
| `http://172.20.0.51:5173` (real) | false | undefined | `TypeError`, nothing copied, nothing reported |

Fix, as directed: drop the button and render the command as selectable text on the Request tab —
`select-all` so one click selects all of it, a `CURL` badge, and a "click to select · ⌘C to copy" hint.
No clipboard API on that path at all.

Two consequences handled in the same change:

- **`⌘C` now yields to a live text selection.** `onKey` called `preventDefault()` unconditionally, so
  ⌘C over the selected command would have copied the whole event instead of the highlighted text.
- **`⌘C` itself was broken by the same root cause** and is a documented shortcut, so
  `argus-webui/src/export/clipboard.ts` adds `copyText()`: try `navigator.clipboard`, else a hidden
  textarea plus `execCommand('copy')`, which is deprecated but is the only thing that works over http.
  The toast now reports the real outcome instead of firing unconditionally.

## 3. CI verified every PR twice

`verify.yml` triggered on both `pull_request` and `push: [main]`, so the post-merge run re-verified the
tree the PR run had already verified. The `push` trigger is dropped; `workflow_dispatch` stays for
verifying main on demand before a release. Accepted tradeoff: a broken merge to main is no longer
caught automatically. `publishToMavenCentral.yml`'s comment claimed Verify guarded main, so it is
corrected too.

## Verification of the follow-up

All of it headless against the dev server bound to a **LAN IP** — the insecure context where the bug
lived — plus `tsc --noEmit` and the 47 unit tests.

- Export menu: both options visible, `aria-expanded`, live counts, Escape and click-outside dismiss,
  menu closes on choose.
- Export all = 17/17 events; Export filtered = 2 events = 2 visible rows of 17, and every exported id
  is one of the visible rows; Export all still exports 17 while the filter is active; "Export filtered"
  disabled at 0 matches while "Export all" stays enabled.
- cURL block: Copy button gone, command rendered with headers, hint shown, one click selects the whole
  command, ⌘C over that selection produces no app toast (native copy runs), no page errors.
- ⌘C with nothing selected still toasts "Copied as cURL", and the command **actually reaches the
  clipboard over http** — proven by poisoning the clipboard with a sentinel, pressing ⌘C, then pasting
  into the search box and reading the value back.
- The whole BodyViewer download suite re-run unchanged (truncated, request body, image bytes, no-body,
  custom payload, round-trip) to confirm the cURL block did not disturb the Request tab.
