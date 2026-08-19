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
- **Export is unfiltered — "all", not "filtered".** One button, no dropdown. #1 explicitly offered
  "a plain export all if we want to keep it simple for a first cut". The filtered set stays reachable
  by clearing filters. Consequence worth knowing: while a filter is active the toast's event count
  exceeds the row count on screen.
- **Download only, no Copy.** #2 asked for both; the user asked for download. The copy gap is much
  smaller than the download gap — `⌘C` already copies the selected event as JSON
  (`keyboard.ts:160-175`) and "Copy as cURL" covers requests (`HttpTabs.ts:217-229`). Stated as an
  assumption instead of blocking on a question.
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
- **No dropdown component built.** `FilterBar/SourceLabelDropdown.ts` was read as the template for a
  filtered/all menu and then not needed once the scope decision landed. Noted so the next person does
  not re-derive it.
- **No version bump** — deferred until fixes accumulate, per
  `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`.

## Context

- **Visuals:** None provided. `design_handoff_argus_inspector/argus/BodyViewer.jsx:13-21` is the
  reference toolbar; `README.md:114` describes it in prose. Both are updated by this change.
- **References:** see `references.md`.
- **Product alignment:** Neither issue is a roadmap item. Adjacent: Phase 2's "Full-body download for
  responses that were truncated during capture" — that is the thing which would make a truncated
  body's download complete, and it is explicitly not in this change.

## Standards Applied

None. `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured; nothing in it governs the webui
DOM layer. `workflow/commit-conventions` applies, as it does to every commit.
