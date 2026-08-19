# Mark redirect hops in the event list — Shaping Notes

## Scope

GitHub issue #11. PR #10 made every hop of a Ktor redirect chain its own `HttpEvent` with its own id,
url and timing — correct, but it left the hops looking like unrelated calls:

```
HTTP  GET  KTOR  ● 302   picsum.photos /200          508 ms
HTTP  GET  KTOR  ● 200   fastly.picsum.photos /id/…  356 ms
```

Give the hops of one logical request a shared handle, mark continuation hops in the list, and make the
chain walkable from the detail pane.

## The constraint that shaped everything

**Hops of one chain are not adjacent in the list.** Unrelated traffic — including events from other
engines and other requests in flight — lands between them. Every "continuation of the row above"
affordance (a bare `↳` glyph, a bracket, a tree indent) is therefore wrong, and a marker that only
labels the row is not enough on its own: the user still cannot find the other end of the chain.

That is why the change has three parts, not one: a self-describing pill on the row, a linked-row
highlight so the chain-mate is findable wherever it is, and a chain list in the detail pane.

## Decisions

- **Carry the relationship as a field, not a string in the data.** `requestGroupId: String?` on
  `HttpEvent`. A literal `[REDIRECTED]` prefix in `request.url` / `request.path` would leak into
  `textQuery` search matching, filters, the detail pane and any export, and it cannot express *which*
  request a hop belongs to. Verification step 5 asserts the leak does not exist.
- **The group id already existed.** `ArgusIdKey` (`ktor/ArgusAttributes.kt:9`) holds the
  per-logical-request UUID minted in `onRequest`. Every redirect hop inherits the request attributes —
  which is precisely why PR #10 had to mint per-hop event ids — so the attribute *is* the group handle,
  and nothing had consumed it as an event id since that PR. No new plumbing.
- **Null for `argus-okhttp` / `argus-urlconnection`.** Both emit one event per logical request by
  design, so a group id would be a group of one. The field defaults to `null` and neither module
  changes. This does mean the marker only ever appears on Ktor traffic — a known engine inconsistency
  tracked in `agent-os/specs/2026-04-30-1845-project-audit/findings/08-phase34.md:42,117,146`, out of
  scope here.
- **Hop ordering comes from arrival order, not timestamps.** Backfill is
  `GET /api/events?limit=500` oldest-first (`websocketSource.ts:82-87`) and the live WS stream is
  chronological; both are prepended by `ingest`, so `store.events` is newest-first with arrival order
  intact. Within a group, the origin hop is the **last** occurrence in the array. Timestamps were
  rejected as the ordering key: `hopTiming` falls back to the request-scoped `startMs` when an engine
  leaves `requestTime`/`responseTime` unset, so two hops can legitimately share a millisecond.
- **`ARGUS_SCHEMA_VERSION` stays at 2.** The field is additive and optional, `ArgusJson` sets
  `ignoreUnknownKeys` (`model/ArgusJson.kt:14`), and the constant's own KDoc says to bump only when
  older clients cannot decode. `SchemaVersionTest` and `scripts/probe-webui/ws-probe.js:52` are
  untouched; a serialization test asserts a payload *without* the key still decodes.
- **Static `↳ REDIRECTED` pill, not a clickable one.** Styled like the existing engine chip, with a
  `title` naming the origin hop. A click target nested inside a row that is itself a click target is
  a fussy interaction to build and explain, and the detail-pane chain already walks the chain.
- **Linked rows differ from selection on two axes.** Selection is a solid inset rail
  (`--border-focus`, 2 px mouse / 3 px keyboard) plus a strong `--bg-selected` fill. A chain-mate of
  the selected row gets a **dashed** rail plus a **faint** `--accent-subtle` wash. Differing on both
  axes means "linked" can never be misread as "selected" at a glance, while still being findable while
  events stream past. A tint-only option was rejected as too quiet; a rail-only option as too thin a
  cue at 2 px.
- **Link scope covers `requestGroupId` AND `correlationId`.** Initially scoped to redirect chains
  only, then widened on request once the linked-row highlight existed: selecting any event lights up
  its chain-mates *and* everything stamped with the same `correlationId` — HTTP calls and log lines
  alike, in both directions. One visual state for "related to the selection" rather than two, because
  the user's question is the same either way: where is the rest of this?
- **Chain lives in the detail overview, not a tab.** The overview block renders on every tab, so the
  chain is visible without a tab switch — which matters precisely because the hops interleave. A
  dedicated `Chain` tab would appear on every HTTP event and be empty for the single-hop majority; the
  Timing tab would hide it behind a click.
- **`computed`, not incremental bookkeeping.** The origin map and the linked-id set are computed over
  `store.events`, so `replace`, `forget` eviction, `clearLocal` and `undoClear` stay correct with no
  extra state to keep in sync. Cost is one pass per ingest over a list that is already fully scanned by
  `applyFilters`.
- **Patch rows in place; never `invalidateAll()`.** Both the pill and the linked state are patched onto
  live pooled rows, following `applyRowSelection` (`Row.ts:41-53`). Dropping the pool per ingested
  event would rebuild the whole window every time an event arrives. A hop that arrives before its
  origin (possible on a backfill/live overlap) gets marked the moment the origin lands.
- **Fixtures exercise the non-adjacent case.** The added two-hop chain has an unrelated event *between*
  the hops, so dev and headless verification see the real shape, not an idealised adjacent pair.
- **The design handoff is updated in the same change.** `design_handoff_argus_inspector/` is the design
  source of truth; commit `c5a00c4` set the precedent of updating it rather than letting it contradict
  the code.

## Correlated logs — a second defect, fixed in the same change

Checking whether correlation was handled properly turned up a real bug in `Related Logs`
(`HttpTabs.ts`): it matched logs on a **±500 ms timestamp window and never read `correlationId` at
all**, despite its own comment calling the window "a fallback when correlationId is absent". The
correlationId branch was never written. Across the whole webui, `correlationId` was only ever
*displayed*, in the optional list column — never used to relate anything.

Both failure directions were live: a log that merely happened to land in the window was reported as
correlated, and a log genuinely from the same `withCorrelation { … }` scope was missed whenever the
call took longer than 500 ms.

Fixed by matching on `correlationId` first and falling back to the window only when the event carries
no id, with the tab now stating which rule it used — an exact id match and a ±500 ms guess are very
different claims and the list looked identical either way. Log lines in the tab are also clickable now,
matching the redirect-chain block.

Not fixed, and worth its own issue: the fallback window is centred on `event.timestamp` and ignores
`durationMs`, so for a slow call it looks in the wrong place entirely. Left alone deliberately —
`correlationId` is the real answer and the window is now only a last resort.

## Found during implementation

- **`element.hidden` does not hide a Tailwind `inline-flex` element.** The pill was built hidden and
  revealed by `applyRowRedirect`, but the UA stylesheet's `[hidden] { display: none }` loses to the
  pill's own `inline-flex` utility class, so the pill painted on **every** HTTP row — including 3xx
  origins and error rows. Caught in the browser (the DOM assertion on `pill.hidden` passed with the bug
  present, which is why the headless check now asserts on *computed* `display`). Fixed by setting
  `style.display` alongside the attribute.
- **Vite served a stale `dev/fixtures/events.ts`** partway through verification — 17 events instead of
  20, with no chain — while the on-disk file was correct. Restarting the dev server after `rm -rf
  node_modules/.vite` fixed it. Worth knowing before concluding a fixture change "didn't work".
- **The mock source compresses fixture timestamps by `speed`** (`4` by default), which shrinks every
  gap by 4×. The ±500 ms related-logs window therefore swallows almost the entire fixture set in dev —
  looks like a bug in the window, is an artifact of the replay. Real device traffic is unaffected.
- **`--accent-subtle` and `--bg-selected` are close in the light theme** (`--blue-50` vs `#e5efff`), so
  the linked wash alone barely separates from the selection tint. The dashed-vs-solid rail is what
  carries the distinction there — which is the reason the decision was to differ on two axes, and why
  a tint-only option would not have worked.

## Context

- **Visuals:** None provided. The ASCII rows above, from the issue, are the reference. The row's
  existing states live in `design_handoff_argus_inspector/argus/EventList.jsx`.
- **References:** see `references.md`.
- **Product alignment:** N/A — bug fix against a filed issue, no roadmap implication.

## Standards Applied

- `cloud/request-response-modeling` — governs the kotlinx.serialization DTO change on `HttpEvent`
  (optional field with a default, `@SerialName` discriminator already in place).
- `naming/code-documentation` — KDoc on the new public field, comments that say *why*; the change also
  corrects two comments PR #10 left stale (`ArgusClientPlugin.kt:278`, `eventStore.ts:98`).
- `testing/test-structure` — kotlin.test in commonTest, backtick names (**no parentheses**: K/N
  rejects them), AAA structure.
- `workflow/commit-conventions` — `fix(...)` prefix, imperative 72-char subject, no agent attribution.
