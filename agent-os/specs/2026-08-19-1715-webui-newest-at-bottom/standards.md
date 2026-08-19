# Standards for Web UI newest-at-bottom

`agent-os/standards/index.yml` indexes 17 categories, **all** of them Kotlin / KMP / Compose standards inherited from the parent Canvas Control app. There is no TypeScript, web, DOM, or SPA standard in the index. Recorded here so the next reader does not re-derive it.

Two entries apply to this change.

---

## naming/code-documentation

> KDoc for public API, inline comments for business logic, document why not what, @see references, no stale comments

**Why it applies — this was the load-bearing standard for this change.** The prepend model was documented explicitly and at length in comments that would have become confident lies after the flip:

- `virtual.ts:1-5` — the module header describing the windowing contract.
- `virtual.ts:26-33` — the `setItems` doc comment: "Prevents the user's view from drifting when new items prepend while they're scrolled away from the head."
- `virtual.ts:35` — `/** True when the viewport is within threshold px of the top (= newest). */` — the "= newest" equivalence baked into the API contract.
- `virtual.ts:63-74` — the two-paragraph explanation of `expectedScrollTop` / `lastSetScrollTop` and the Chromium stomp.
- `EventList.ts:43-47` — "they prepend at index 0 and scrollTop=0 keeps showing them".
- `Waterfall.ts:19-24` — the redraw/scroll contract.
- `websocketSource.ts:139-141` — "would re-prepend events the user can already see".

All were rewritten, not left to rot. The `@see design_handoff_argus_inspector/argus/EventList.jsx` reference on `createEventList` was kept.

---

## workflow/commit-conventions

> feat/fix/refactor/chore/docs/test/style/perf/ci/build types, imperative 72-char subject, no agent attribution trailers

**Why it applies:** governs the commit for this work. Also restated in `AGENTS.md` (stage files explicitly, no AI attribution trailers).
