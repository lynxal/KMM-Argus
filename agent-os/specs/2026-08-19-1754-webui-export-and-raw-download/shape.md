# Export all events + download raw payloads — Shaping Notes

## Scope

GitHub issues #1 ("Web UI: export all logs to a file") and #2 ("Web UI: download/copy the payload
shown in raw mode"), folded into one change. Both are blocked on the same missing primitive: there is
no `Blob` + `<a download>` code anywhere in `argus-webui/src`. #2 says as much itself — "worth
extracting one small `downloadFile(name, mime, data)` helper and using it in both places."

Ships:

- A textual **Export** CTA in the top bar that writes every captured event to one JSON file.
- A textual **Download** button in the `BodyViewer` toolbar, which puts it on the Log Raw tab, the
  HTTP Raw / Request / Response bodies, and the Custom payload / Raw tabs in a single edit.
- `src/export/exportFile.ts` — the shared helper, split so the decisions live in pure functions and
  only `downloadFile` touches the DOM.

## Decisions

- **Textual buttons, not icon buttons.** The user's call, and it deviates from
  `design_handoff_argus_inspector/argus/BodyViewer.jsx:19-20` (12 px `copy` / `download` icon
  buttons). The handoff is updated in the same change rather than left contradicting the code — same
  approach as the row-highlight spec. Consequence: the `download` icon at `src/design/icons.ts:23`
  stays unused.
- **Export offers both scopes, via a menu.** Shipped first as a single unfiltered button (#1 offered
  "a plain export all ... for a first cut"); review asked for the choice, so the CTA is now a menu
  with **Export all** and **Export filtered**, each showing its live count, each disabled when its set
  is empty. "Filtered" exports `store.filteredEvents` — exactly the visible rows. This is what #1
  originally asked for; the first cut was the simplification.
- **Download only, no Copy button in BodyViewer.** #2 asked for both; the user asked for download.
  Copy is served by `⌘C` and, on the Request tab, by the selectable cURL block below.

- **"Copy as cURL" was genuinely broken, and is now selectable text instead of a button.** Reported in
  review. Root cause, measured in a headless Chrome against the dev server bound to a LAN address:
  `navigator.clipboard` is gated on `isSecureContext`, and the UI is normally served by the device over
  plain http on a LAN IP, where the whole `clipboard` object is `undefined`. Reading `.writeText` off
  it throws **synchronously**, so `navigator.clipboard.writeText(...).catch(() => undefined)` could
  never catch it — the click threw `TypeError: Cannot read properties of undefined (reading
  'writeText')`, copied nothing, and reported nothing. Over `localhost` in dev the same code works,
  which is why it looked fine locally. Evidence:

  | origin | isSecureContext | navigator.clipboard | click result |
  | --- | --- | --- | --- |
  | `http://localhost:5173` | true | object | copies, but no toast ever fired |
  | `http://172.20.0.51:5173` | false | undefined | TypeError, nothing copied |

  The fix the user asked for removes the dependency rather than working around it: the Request tab now
  renders the command as selectable text (`select-all`, so one click selects all of it) with a `CURL`
  badge and a "click to select · ⌘C to copy" hint. No button, no clipboard API.

- **`⌘C` yields to a live text selection.** Once the cURL command is selectable, the shortcut had to
  stop swallowing it — `onKey` called `preventDefault()` unconditionally, so ⌘C over selected text
  copied the whole event instead of the highlighted text. It now returns early when the document has a
  non-empty selection and lets the browser's native copy run.

- **`copyText()` keeps the `⌘C` path working over http.** ⌘C had the same insecure-context defect and
  is a documented shortcut in the modal, so it is fixed rather than left broken: `src/export/
  clipboard.ts` tries `navigator.clipboard` and falls back to a hidden textarea plus
  `execCommand('copy')`, which is deprecated but is the only thing that works over plain http. The
  toast now reports the actual outcome instead of firing unconditionally. Proven end-to-end by pasting
  the result back into the search box over a LAN origin.
- **Format: a JSON envelope, `events` as an array of `ArgusEvent`.** #1 asked for "NDJSON or a single
  JSON array"; we wrap the array in
  `{ argusSchemaVersion, exportedAt, device, eventCount, events }`. `jq '.events[]'` still works and
  re-ingesting `.events` still round-trips, and the file becomes self-describing — which device, which
  app version, which schema — which is what makes it useful attached to a ticket. **This is a
  deliberate deviation from the issue text.**
- **Chronological order in the file.** `store.events` is newest-first (`eventStore.ts:157` prepends);
  the export reverses to oldest-first so it reads like a log. Re-ingest still lands newest-first
  because `ingest` prepends.
- **Paused buffer excluded.** `store.pausedBuffer` is not part of `store.events` until `resume()`
  (`eventStore.ts:168-181`). #1's own open question suggested "visible set only, to match what the
  user sees" — followed.
- **A truncated body downloads, with the truncation stated — it is not disabled.** The cap is applied
  at capture inside the library (`argus-core/.../BodyEncoding.kt:30-38`); only `bodyPreview` and
  `bodyTruncatedTotalBytes` ever reach the browser, so the missing bytes do not exist client-side and
  a full download is impossible until the Phase 2 roadmap item ("Full-body download for responses that
  were truncated during capture") lands. So the button stays enabled, the filename gains a
  `-truncated` marker, and the toast names both byte counts. Nothing half-complete can be mistaken for
  whole.
- **`⌘E` is out of scope.** #1 calls it a follow-up; leaving it out keeps the shortcut table
  untouched.
- **No new devDependency, no DOM test.** argus-webui's vitest runs in the default `node` environment
  with no jsdom (no `test` block in `vite.config.ts`, jsdom absent from `package.json`). The module is
  split so the envelope, filename, extension, and base64 decode are all unit-testable pure functions;
  the DOM half is one function tests never call. Mirrors the established pattern of a pure
  `*.states.ts` beside a DOM component (`ConnectionBanner.states.test.ts`).
- **`bus` is threaded down to `BodyViewer` rather than faked.** `createEventDetail` already receives
  `ShortcutBus` and dropped it before the tabs; the three tab factories now forward it. The
  alternative — a transient "Downloaded" label on the button — would have avoided four signature
  edits but diverged from the existing toast UX for Clear / Copy.
- **The export menu mirrors `SourceLabelDropdown`.** Portaled to `document.body` with
  `position: fixed`, positioned off the trigger's rect, repositioned on scroll/resize, dismissed by
  click-outside and Escape. An absolutely positioned child would be clipped by the 40 px top bar.

- **CI: `Verify (JVM/Android)` is PR-only.** It triggered on both `pull_request` and `push: [main]`,
  so every PR was verified twice — once on the PR, once again post-merge on the same tree. The `push`
  trigger is dropped; `workflow_dispatch` remains for verifying main on demand before a release. The
  tradeoff, accepted: a broken merge to main is no longer caught automatically, only by the next PR or
  a manual dispatch. `publishToMavenCentral.yml`'s comment claimed the workflow guarded main, so it is
  corrected in the same change.
- **No version bump** — deferred until fixes accumulate, per
  `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`.

## Context

- **Visuals:** None provided. `design_handoff_argus_inspector/argus/BodyViewer.jsx:13-21` is the
  reference toolbar; `README.md:114` describes it in prose. Both are updated by this change, as is the
  handoff's cURL description (`README.md:65`), which specified a Copy button we are deliberately not
  shipping.
- **References:** see `references.md`.
- **Product alignment:** Neither issue is a roadmap item. Adjacent: Phase 2's "Full-body download for
  responses that were truncated during capture" — that is the thing which would make a truncated
  body's download complete, and it is explicitly not in this change.

## Standards Applied

None. `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured; nothing in it governs the webui
DOM layer. `workflow/commit-conventions` applies, as it does to every commit.
