# Mark redirect hops in the event list — issue #11

## Context

PR #10 fixed redirect hops sharing one event id: each hop of a Ktor redirect chain is now its own
`HttpEvent` with its own id, url and timing. Correct, but it left a readability gap. One
`client.get("https://picsum.photos/200")` renders as two rows with nothing tying them together:

```
HTTP  GET  KTOR  ● 302   picsum.photos /200          508 ms
HTTP  GET  KTOR  ● 200   fastly.picsum.photos /id/…  356 ms
```

They read as two unrelated calls. And the hops are **not necessarily adjacent** — unrelated traffic
lands between them, so any marker implying "continuation of the row above" is actively wrong.

Outcome: every hop of one logical request carries a shared handle; continuation hops get a
self-describing pill in the list; selecting a hop lights up its chain-mates wherever they are; and the
detail pane lists the whole chain so it can be walked.

## Approach

Carry the relationship as a field (`requestGroupId`), never as a string baked into `request.url` /
`request.path` — a literal prefix in the data would leak into `textQuery` search, filters, the detail
pane and any export.

The group id already exists in the plugin: `ArgusIdKey` holds the per-logical-request UUID minted in
`onRequest`. Every redirect hop inherits the request attributes — exactly why PR #10 had to mint
per-hop event ids — so that attribute *is* the group handle, and nothing consumes it as an event id
any more.

Two facts settle the design:

- **Hop ordering needs no timestamps.** Backfill is `GET /api/events?limit=500` oldest-first
  (`websocketSource.ts:82-87`) and the live WS stream is chronological; both are prepended by
  `ingest`, so `store.events` is newest-first with arrival order preserved. Within a group the origin
  hop is always the **last** occurrence in the array. Timestamps are unreliable here — both hops can
  share a millisecond when `hopTiming` falls back to the request-scoped start.
- **No `ARGUS_SCHEMA_VERSION` bump.** It stays at `2`. The field is additive and optional, `ArgusJson`
  already sets `ignoreUnknownKeys` (`model/ArgusJson.kt:14`), and the constant's KDoc says to bump
  only when older clients cannot decode. `SchemaVersionTest` and `scripts/probe-webui/ws-probe.js:52`
  stay untouched.

### Presentation decisions

| Decision | Chosen | Why |
| --- | --- | --- |
| Row marker | Static `↳ REDIRECTED` pill, styled like the engine chip, `title` names the origin | Self-describing; implies no adjacency. Not clickable — a click target inside a row that is itself a click target, for a chain the detail pane already walks |
| Chain-mate rows | Dashed left rail in `--border-focus` + `--accent-subtle` wash, on selection | Differs from selection on both axes (dashed vs solid rail, weak vs strong fill), so it's findable while scanning and never reads as "selected" |
| Link scope | Same `requestGroupId` only | Exact, not heuristic; `correlationId` linking would light up many rows and is wider than this issue |
| Detail chain | `Redirect chain` block in the overview | Hops interleave, so the chain must be visible without a tab switch; a permanent tab empty for the single-hop majority is worse |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-19-1758-mark-redirect-hops-in-event-list/` with:

- **plan.md** — this plan
- **shape.md** — scope, the decisions table above, and the interleaving constraint that drove them
- **standards.md** — full content of `cloud/request-response-modeling`, `naming/code-documentation`,
  `testing/test-structure`, `workflow/commit-conventions`
- **references.md** — the code studied (see *References* below)
- no `visuals/` — none provided; the issue's ASCII rows are reproduced in shape.md

## Task 2: `argus-core` — add `requestGroupId` to `HttpEvent`

- `argus-core/.../model/HttpEvent.kt` — append `val requestGroupId: String? = null` **after** `engine`
  so no positional call site shifts. KDoc: shared by every hop of one logical request; null for
  engines that emit one event per logical request.
- `argus-core/.../ktor/ArgusClientPlugin.kt` — in `emitSuccess`, `emitError` and `emitNetworkError`,
  replace `if (attrs.getOrNull(ArgusIdKey) == null) return` with
  `val groupId = attrs.getOrNull(ArgusIdKey) ?: return` and pass `requestGroupId = groupId`. Update
  the comment at `:278-281` — the attribute is no longer unused, it is now the group handle.
- `argus-okhttp` / `argus-urlconnection` — **no change**. Both emit one event per logical request
  (application-level interceptor; `instanceFollowRedirects`), so the default `null` is correct, and
  every call site there already uses named arguments.

## Task 3: `argus-webui` — mirror the field

- `argus-webui/src/transport/schema.ts` — add `requestGroupId?: string | null` to `HttpEvent` (after
  `engine`, matching the Kotlin order), commented as Ktor-only and noting hops of one chain are not
  necessarily adjacent in the stream. Leave `ARGUS_SCHEMA_VERSION = 2`.

## Task 4: `argus-webui` — pure chain derivation

New `argus-webui/src/store/redirects.ts` (pure, no DOM — the project has no jsdom, so all logic lives
where vitest can reach it):

- `buildRedirectOrigins(events): ReadonlyMap<string, HttpEvent>` — one pass from the **end** of the
  newest-first array toward the start; the first member of a `requestGroupId` seen is the origin, each
  later member maps to it. Keyed by hop event id. Groups of one produce no entry.
- `redirectChain(events, event): HttpEvent[]` — the group's hops oldest-first; empty when
  `requestGroupId` is null or the group has one member.

Wire into `argus-webui/src/store/eventStore.ts`:

- `readonly redirectOrigins: Signal<ReadonlyMap<string, HttpEvent>>` — `computed` over `events`
  (not `filteredEvents`: a hop stays marked when its 3xx origin is filtered out, which is the
  informative behaviour). `computed` rather than incremental bookkeeping so `replace`, `forget`
  eviction, `clearLocal` and `undoClear` stay correct for free.
- `readonly linkedIds: Signal<ReadonlySet<string>>` — `computed` over `events` + `selectedId`:
  the selected event's chain-mates, excluding itself. Empty when nothing is selected, the selection
  isn't HTTP, or its group has one member.
- While in this file: the `seenIds` comment at `:98-109` still claims redirect hops share an id.
  PR #10 made that false — trim it to the reconnect/backfill case it still describes.

## Task 5: `argus-webui` — the `↳ REDIRECTED` pill

`argus-webui/src/components/EventList/Row.ts`:

- Always build the pill for HTTP rows, `hidden` by default, tagged `data-redirect-pill`, placed
  immediately before the host/path cell. Reuse `createEngineChip`'s class recipe for consistency.
- Export `applyRowRedirect(row, origin: HttpEvent | null)` — toggles `hidden`, sets `title` to
  `continuation of GET picsum.photos/200 — 302`. Mirrors `applyRowSelection` (`:41-53`), which exists
  because the virtual list pools row elements by event id.
- Extend `RowContext` with `redirectOrigin: HttpEvent | null` so rows built by a scroll-driven render
  are born correct.

`argus-webui/src/components/EventList/EventList.ts`:

- Pass `redirectOrigin: store.redirectOrigins.peek().get(event.id) ?? null` in `renderRow` (`peek`,
  per the convention documented at `:28-32`).
- Add an effect reading `store.redirectOrigins.value` that patches live rows via `applyRowRedirect`,
  keyed off `row.dataset['eventId']` — same shape as the selection effect at `:105-118`.
  **No `invalidateAll()`**: patching in place keeps the row pool intact, so a hop that arrives before
  its origin (possible on a backfill/live overlap) gets marked the moment the origin lands, with no
  pool churn per ingested event.

## Task 6: `argus-webui` — linked chain-mate rows

`argus-webui/src/styles/globals.css` — new class next to `.ds-row-rail` / `.ds-row-rail-kb`
(`:541-550`). The file is exempt from the px/hex token lint, same as the existing rails:

```css
/* Linked row — a chain-mate of the selected event. Dashed rail plus a faint wash,
   so it differs from selection on both axes and can never read as "selected". */
.ds-row-linked {
  background-image: repeating-linear-gradient(
    to bottom,
    var(--border-focus) 0 4px,
    transparent 4px 8px
  );
  background-size: 2px 100%;
  background-repeat: no-repeat;
}
```

`Row.ts` — export `applyRowLinked(row, linked)` toggling `ds-row-linked` plus the
`bg-accent-subtle` utility (`--accent-subtle` is defined in both themes — `globals.css:169,279`).
Invariants to keep:

- A selected row is never linked to itself, so the two fills never stack.
- `hover:bg-bg-hover` outranks the flat `bg-accent-subtle` (the specificity trap documented at
  `Row.ts:26-29`), so hovering a linked row replaces its wash but **keeps the dashed rail** — the
  link cue survives the hover. Document that rather than fighting it.

`EventList.ts` — fold the linked patch into the existing selection effect (`:105-118`), which already
owns "row state relative to the selection"; it gains a read of `store.linkedIds.value`. Also pass
`linked` through `RowContext` so scroll-built rows are born correct.

## Task 7: `argus-webui` — walkable chain in the detail pane

`argus-webui/src/components/EventDetail/tabs/HttpTabs.ts`:

- In `renderOverview`, append a `Redirect chain` block, rendered only when `redirectChain(...)` returns
  more than one hop. One line per hop: index, status pill, method, host + path, duration, with the
  current hop visually marked. Each line is a button setting `store.selectedId` and
  `store.selectionSource = 'mouse'`.
- `renderOverview` needs `store`; `createHttpTabs` already receives it (`:23`), so this is a signature
  change on a private function only. Reuse the already-imported `STATUS_BUCKET_TEXT` /
  `STATUS_BUCKET_DOTS`.

## Task 8: Design handoff sync

`design_handoff_argus_inspector/` is the design source of truth, and commit `c5a00c4` set the
precedent of updating it when row visuals change:

- `README.md` — the EventList row-layout bullets (`:52-57`) and the selection-states section
  (`:147-152`): document the `↳ REDIRECTED` pill and the linked-row dashed rail + `accent-subtle`
  wash, including why linked differs from selected on two axes.
- `argus/EventList.jsx` — mirror both states in the spec JSX.

## Task 9: Fixtures

`argus-webui/src/dev/fixtures/events.ts` — add a two-hop chain sharing a `requestGroupId` with an
unrelated event **between** the hops, so dev and headless verification exercise the non-adjacent case.
The existing `http()` helper takes an `extra` partial, so `{ requestGroupId: 'grp_redirect_1' }` needs
no signature change.

## Task 10: Tests

Kotlin (`kotlin.test`, commonTest, backtick names — **no parentheses**, K/N rejects them):

- `.../ktor/ArgusClientPluginTest.kt` — extend `redirect emits one event per hop…` (`:68`) to assert
  both hops carry the same non-null `requestGroupId` while keeping distinct ids; assert a single-hop
  GET still gets a non-null `requestGroupId`.
- `.../model/EventFactories.kt` — add a `requestGroupId` parameter to `createTestHttpEvent`
  (default `null`).
- `.../model/ArgusEventSerializationTest.kt` — round-trip an `HttpEvent` with a populated
  `requestGroupId`, and assert a JSON payload *without* the key still decodes (backward compatibility,
  the whole reason the schema version stays at 2).

TypeScript (vitest):

- New `argus-webui/src/store/__tests__/redirects.test.ts` — in-order arrival; out-of-order arrival
  (hop before origin); unrelated events interleaved between hops; single-hop group yields no entry;
  `requestGroupId: null` (okhttp/urlconnection) yields no entry; `redirectChain` ordering is
  oldest-first.
- `argus-webui/src/store/__tests__/eventStore.test.ts` — `linkedIds` is empty with no selection,
  excludes the selected event itself, and covers both directions (selecting the origin lights the
  continuation and vice versa).

## Verification

1. `./gradlew :argus-core:jvmTest :argus-core:testDebugUnitTest` — plugin + serialization tests.
2. `./gradlew :argus-core:allTests` — covers `compileTestKotlinIos*`. Treat any
   `TestOutputStore` / "Buffer underflow" reporter error as a real failure to investigate, not a
   `--no-parallel` toggle.
3. `cd argus-webui && npm test && npm run lint` — vitest plus `tsc --noEmit` and the token linter.
4. Headless DOM check — `npm run dev`, then scratchpad `playwright-core` against
   `http://localhost:5173/?simulate=off` (mock source replays the fixtures, no device needed). Assert:
   exactly one row carries the pill; its `title` names the origin hop; the origin row does **not**
   carry it; selecting either hop applies `ds-row-linked` to the other and not to the interleaved row
   between them; and the detail pane lists both hops.
5. Filter-bar regression — type `REDIRECTED` in the text filter and confirm **zero** matches
   (`applyFilters` searches `request.url` + `request.path` only, `filters.ts:113-116`), proving the
   marker lives in the UI and not in the data.
6. Both themes — toggle light/dark and confirm the dashed rail and wash stay legible (light
   `--accent-subtle` is `--blue-50`, dark is a 14 % blue).
7. Optional end-to-end on real traffic — the sample app hitting `https://picsum.photos/200`, the exact
   case in the issue.

## References

- `argus-core/.../ktor/ArgusClientPlugin.kt` — `perHopRequest` (`:234`), `hopTiming` (`:257`), and the
  per-hop id comment (`:278`): the PR #10 work this builds on.
- `argus-core/.../ktor/ArgusAttributes.kt:9` — `ArgusIdKey`, the group handle.
- `argus-webui/src/components/EventList/Row.ts:41-53` — `applyRowSelection`, the pattern both new
  patch functions copy, and the hover-specificity note at `:26-29`.
- `argus-webui/src/styles/globals.css:541-550` — the existing rails the linked style sits beside.
- `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts:193` — `renderRelatedLogs`, the closest
  existing "other events related to this one" section.
- `argus-webui/src/transport/websocketSource.ts:82-87` — backfill ordering, which the origin-detection
  rule depends on.
- `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/` and commit `c5a00c4` — the row-state
  patching precedent, including the handoff-sync convention.
- `agent-os/specs/2026-04-30-1845-project-audit/findings/08-phase34.md:42,117,146` — why okhttp and
  urlconnection can't show a chain at all. Out of scope; worth its own issue.

## Implementation notes (post-execution)

All tasks completed, plus two things the plan did not anticipate:

- **Rebased onto `origin/main` mid-implementation.** The worktree was 4 commits behind, and PR #13
  ("put the newest event at the bottom of the list") inverted `store.events` from newest-first to
  oldest-first — the exact ordering this change's origin detection reads. The rule flipped from "the
  origin is the LAST occurrence of its group" to "the FIRST", `redirectChain` stopped reversing, and
  every ordering fixture in `redirects.test.ts` was rewritten to arrival order.
- **`Related Logs` was fixed too, on request.** It matched on a ±500 ms window and never read
  `correlationId`. Logic extracted to a new pure `store/related.ts` (`relatedLogEvents`,
  `linkedEventIds`), which also widened the linked-row highlight to cover correlation scopes, not just
  redirect chains. The time window was then dropped entirely rather than kept as a fallback. See
  shape.md for the detail.

Deviations in the original tasks:

- `applyRowRedirect` sets `pill.style.display` as well as `pill.hidden` — the `hidden` attribute alone
  is overridden by the pill's `inline-flex` class, which left the pill visible on every HTTP row. The
  headless check asserts on computed `display`, not on the attribute, because the attribute-based
  assertion passed while the bug was live.
- `dev/fixtures/events.ts` gained a `STATUS_TEXT` lookup map, replacing the nested status-text ternary
  the new 302 fixture would otherwise have extended by another level.

Verified: `:argus-core:allTests` (all targets incl. iOS), `:argus-okhttp:test`,
`:argus-urlconnection:test`, `:argus-server-core:allTests` all green; 68/68 vitest; `tsc --noEmit`
clean. Headless check confirms exactly one *painted* pill with the origin named in its tooltip, zero
text-filter matches for `REDIRECTED`, the linked rail landing on the chain-mate in both directions with
the interleaved log row untouched, correlation linking in both directions (HTTP↔log) with uncorrelated
selections linking nothing, and `Related Logs` relating on correlationId alone. The `lint-tokens` failure
on `src/components/EmptyStates/WaitingForEvents.ts:17-18` is pre-existing — reproduced on a clean tree.

## Out of scope

- Collapsing a chain into one expandable row. The group id makes it possible later with no further
  schema change.
- Linking by `correlationId` as well as `requestGroupId`.
- Making `argus-okhttp` / `argus-urlconnection` emit per-hop events so they can show chains too.
