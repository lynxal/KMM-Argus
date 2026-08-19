# References for export all events + download raw payloads

## Prior art studied

### Textual button styling — "Copy as cURL"

- **Location:** `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts:217-229`
- **Relevance:** the only textual (non-icon) action button in the app, and the closest sibling to what
  both new buttons are.
- **Key patterns:** class string
  `px-2 h-6 rounded-sm bg-bg-subtle text-fg-1 text-xs font-ui hover:bg-bg-active cursor-pointer`,
  reused verbatim as `TopBar.styles.textBtn` so the app's textual buttons match. Note this button
  fires no toast and swallows failures (`.catch(() => undefined)`) — the new buttons do toast, matching
  the keyboard path instead.

### Icon button factory + toast producer — TopBar

- **Location:** `argus-webui/src/components/TopBar/TopBar.ts:82-95` (factory), `:101-105` (Clear)
- **Relevance:** Clear is the existing bulk action the Export CTA sits beside, and the convention the
  file documents is "buttons emit the same ShortcutActions the keyboard bus dispatches — shortcut and
  click are the same path".
- **Key patterns:** `bus.toast.value = { msg, at: Date.now() }` is the whole toast API (`Toast.ts` is a
  pure consumer of the signal, auto-dismissing after 3 s). `source.device.value` is already read by
  the app-badge effect at `:161-171` — that is where the export filename's package name comes from.

### Pure logic beside a DOM component

- **Location:** `argus-webui/src/components/Overlays/ConnectionBanner.states.ts` +
  `__tests__/ConnectionBanner.states.test.ts`
- **Relevance:** the project's answer to "vitest runs in node with no jsdom, so how do we test a DOM
  component". Extract the decisions, test those.
- **Key patterns:** followed by `src/export/exportFile.ts` — envelope, filename, extension, and base64
  decode are pure and tested; `downloadFile` is the only DOM-touching export and is never called from
  a test.

### Portaled popover — SourceLabelDropdown

- **Location:** `argus-webui/src/components/FilterBar/SourceLabelDropdown.ts`
- **Relevance:** **studied and then not used.** It was the template for an "Export filtered / Export
  all" menu; the scope decision (export all, one button) removed the need. Recorded so the next person
  planning a top-bar menu finds the pattern — trigger with `aria-haspopup`/`aria-expanded`, popover
  portaled to `document.body` with `position: fixed` and `z-popover`, repositioned on scroll/resize,
  closed by document click-outside plus Escape.

### Handoff-deviation precedent

- **Location:** `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`
- **Relevance:** the same situation — an implementation decision that contradicts
  `design_handoff_argus_inspector/`. That spec updated the handoff in the same change rather than
  letting the two drift. Followed here for the icon → text button change.

## Files changed by this spec

- `argus-webui/src/export/exportFile.ts` — new. The shared helper both issues needed.
- `argus-webui/src/export/__tests__/exportFile.test.ts` — new.
- `argus-webui/src/components/TopBar/TopBar.ts`, `TopBar.styles.ts` — Export CTA, `textBtn` style key.
- `argus-webui/src/components/BodyViewer/BodyViewer.ts` — Download button, `downloadName` + `bus` props.
- `argus-webui/src/components/EventDetail/EventDetail.ts` — forwards `bus` to the tab factories.
- `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts`, `LogTabs.ts`, `CustomTabs.ts` — accept
  `bus`, pass `downloadName` at each of the six `createBodyViewer` call sites.
- `design_handoff_argus_inspector/README.md`, `argus/BodyViewer.jsx`, `argus/TopBar.jsx` — reconciled
  with what shipped.

## Wire-contract facts the export depends on

- `ARGUS_SCHEMA_VERSION` — `argus-webui/src/transport/schema.ts:9`. Reused in the envelope, not
  hardcoded.
- `DeviceInfo` — `schema.ts:135-146`. `pkg` supplies the filename; `argusVersion` from `ServerAppInfo`
  is dropped by `websocketSource.ts:65-72`'s mapping and so is *not* in the export.
- Bodies are always strings client-side (`bodyPreview`) — there is no binary field, so image mode's
  download has to base64-decode what the viewer was handed.
- The WebSocket backfill fetches `?limit=500` (`websocketSource.ts:83`), so an export can hold fewer
  events than the device's ring buffer. Not addressed here.
