# References — mark redirect hops in the event list

## The change this builds on

### PR #10 — per-hop event ids

- **Location:** commit `b9b665b`, `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt`
  — `perHopRequest` (`:234`), `hopTiming` (`:257`), the per-hop id comment (`:278-281`)
- **Relevance:** it created both the capability (each hop is a real event) and the gap (nothing ties
  them together) that issue #11 closes.
- **Key patterns:** the reason `ArgusIdKey` is free to become the group id — the comment at `:278`
  spells out that request attributes are inherited by every hop, so an id stored there is shared.
  `perHopRequest` is also the proof that `call.request` and the `onRequest` snapshot diverge on a
  redirect.

### `ArgusIdKey`

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusAttributes.kt:9`
- **Relevance:** the per-logical-request UUID that becomes `requestGroupId`.
- **Key patterns:** `attributes.getOrNull(...)` guards in all three emit paths — the new code folds the
  existing null check into the value it now needs.

## Row-state patching

### Selected event row highlight (issue #3)

- **Location:** `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`, implemented at
  `argus-webui/src/components/EventList/Row.ts:41-53` and `EventList.ts:105-118`
- **Relevance:** the closest possible prior art — same component, same problem shape (a row's
  appearance must change without rebuilding the row).
- **Key patterns:**
  - `applyRowSelection` exists because `virtual.ts` pools row elements keyed by `event.id` and only
    re-invokes `renderRow` on a pool miss. Both new patch functions (`applyRowRedirect`,
    `applyRowLinked`) copy that shape, including toggling every class in *both* directions so a pooled
    row carrying stale state is safe.
  - The hover-specificity trap documented at `Row.ts:26-29`: `.hover\:bg-bg-hover:hover` is (0,2,0)
    and outranks a flat `.bg-*` utility at (0,1,0). It applies again to the linked row's
    `bg-accent-subtle` wash — hover replaces the wash, the dashed rail survives, which is acceptable.
  - `invalidateAll()` is reserved for changes to row *content* (the `textQuery` `<mark>` spans, the
    correlation-id column). Neither of the new states qualifies.
  - Rail styles live in `argus-webui/src/styles/globals.css:541-550` (`.ds-row-rail`,
    `.ds-row-rail-kb`); `globals.css` is exempt from the px/hex token lint
    (`scripts/lint-tokens.ts:19-23`), which is why the new dashed rail can be written there.
  - That commit (`c5a00c4`) also updated `design_handoff_argus_inspector/README.md` and
    `argus/EventList.jsx` rather than let the handoff contradict the code — the convention Task 8
    follows.

### Correlation-id column toggle

- **Location:** `agent-os/specs/2026-04-30-1136-webui-small-bugs/`, `EventList.ts:130-134`
- **Relevance:** the other half of the pool-invalidation rule — a structural row change that *does*
  need `invalidateAll()`. Useful as the contrast case when deciding the pill needs no invalidation.

## Related-events UI

### `renderRelatedLogs`

- **Location:** `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts:193-219`
- **Relevance:** the existing "other events related to this one" section, and the closest model for the
  `Redirect chain` block.
- **Key patterns:** renders a plain list with an explicit empty state; reads `store.events.value`
  directly at render time rather than holding derived state. The chain block reads the store the same
  way but is omitted entirely for single-hop requests instead of showing an empty state.

## Ordering guarantees the derivation depends on

### Backfill + live stream

- **Location:** `argus-webui/src/transport/websocketSource.ts:82-87` (backfill, oldest-first),
  `argus-webui/src/store/eventStore.ts:134-157` (`ingest`, prepends)
- **Relevance:** establishes that `store.events` is newest-first with arrival order preserved, which is
  what makes "the origin hop is the last occurrence of its group" correct without any timestamp
  comparison.
- **Key patterns:** the `seenIds` replace-in-place logic in the same file, whose comment still described
  the pre-PR-#10 shared-id behaviour and is corrected in this change.

## Wire-schema conventions

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt`,
  `model/ArgusJson.kt:12-16`, `argus-webui/src/transport/schema.ts:1-9`
- **Relevance:** the two hand-maintained mirrors of the event schema, and the rule for when
  `ARGUS_SCHEMA_VERSION` moves.
- **Key patterns:** `ignoreUnknownKeys = true` plus the "bump only when older clients cannot decode"
  KDoc are what allow an additive optional field at version 2. The version is also asserted in
  `argus-core/.../model/SchemaVersionTest.kt` and `scripts/probe-webui/ws-probe.js:52`, both of which
  stay untouched.

## Known inconsistency, deliberately out of scope

- **Location:** `agent-os/specs/2026-04-30-1845-project-audit/findings/08-phase34.md:42,117,146`
- **Relevance:** `argus-okhttp` uses an application-level interceptor so redirects don't duplicate, and
  `argus-urlconnection` only sees the final URL via `instanceFollowRedirects`. Neither can show a chain,
  so `requestGroupId` is null there and the marker is Ktor-only.
