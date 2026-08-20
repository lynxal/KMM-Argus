# Standards for argus-webui CI + self-hosted runners

Two entries from `agent-os/standards/index.yml` apply. One relevant standard does **not** exist in
this repo and the absence is recorded rather than filled in with a local invention.

---

## The gap: there is no `ci/` category in this repo

`agent-os/standards/index.yml` has no CI or GitHub Actions category at all. The standard that would
govern this work — `ci/actions-node-runtime`, which constrains action `uses:` runtime pins — lives in
`lynxal/canvas-cm` (`projects/mobile-control-multiplatform/standards/`), scoped to the mobile-control
project, and was cited by `canvas_hub_core_application`'s own runner-migration spec.

Nothing was written to fill that gap here. The convention actually followed is the one the two
existing Argus workflows already demonstrate, which is narrower than a standard and is stated as
observed practice, not as policy:

- Actions pinned to a major tag: `actions/checkout@v4`, `actions/setup-java@v4`,
  `actions/cache@v4`, `gradle/actions/setup-gradle@v3`, `gradle/wrapper-validation-action@v3`.
  `verify-webui.yml` follows suit with `actions/setup-node@v4` and `actions/upload-artifact@v4`.
- Every workflow states **why** its triggers are shaped the way they are, in a comment above `on:`.
  `verify.yml` explains why `push: [main]` was removed (it doubled every PR);  `verifyIos.yml`
  explains its `skip-smoke` escape hatch. `verify-webui.yml` follows the form and additionally
  records the cost of the `paths` filter — a skipped paths-filtered workflow reports no status, so
  the check cannot be made required without a no-op guard job.
- An explicit `timeout-minutes` on every job.

If a `ci/` standard is ever wanted in this repo, these three points are what it would say.

---

## testing/test-structure

> Kotlin.test framework, commonTest default, backtick test names, AAA structure, @BeforeTest setup

**Why it applies, and how far.** This standard governs Kotlin tests, and every rule in it is
Kotlin-specific — `kotlin.test` imports, `commonTest` placement, backtick function names,
`@BeforeTest`. None of it reaches TypeScript. It matters here for two reasons.

First, **it is why the Web UI gap existed in the first place.** The standard is the reason Argus has
a well-covered Kotlin test suite wired into `verify.yml` and nothing at all for `argus-webui` — the
convention had no TypeScript half, so nobody noticed the missing job.

Second, **one rule does transfer, and this work respects it**: *describe the behavior, not the
implementation.* The vitest suites and the three probes already do — `follow-tail-probe.js` asserts
"filtered-out event stays hidden" and "visible event advances the tail by one row", not internal
call shapes. That property is what makes the probes worth running in CI: a restyle cannot turn a real
failure into a silent pass, and `related-logs-probe.js` reads the tab strip through
`[data-detail-tabs]` structurally for exactly that reason.

The AAA structure and `@BeforeTest` rules have no TypeScript analogue applied here, and none was
invented.

Full text: `agent-os/standards/testing/test-structure.md`.

---

## workflow/commit-conventions

> feat/fix/refactor/chore/docs/test/style/perf/ci/build types, imperative 72-char subject, no agent attribution trailers

**Why it applies.** This change is entirely CI and tooling, so the `ci:` type carries most of it,
with `fix:` for the `npm run lint` bug (a real defect, not a config change) and `docs:` for the probe
README. Three rules are load-bearing here:

- **Reference the issue.** Every commit in this change carries `(#17)`.
- **Do not mix unrelated changes in a single commit.** The lint fix, the version-probe screenshot,
  the probe npm scripts plus README, the new workflow, and the spec docs are separable things and
  were committed separately. The temporary runner-probe workflow got its own commit for the same
  reason — it was always going to be deleted, and a throwaway should not be tangled up with what
  ships.
- **No agent attribution.** No `Co-Authored-By` or `Signed-off-by` trailer identifying an AI agent,
  on any commit.
- **Stage files explicitly by name** — no `git add -A`.

Full text: `agent-os/standards/workflow/commit-conventions.md`.
