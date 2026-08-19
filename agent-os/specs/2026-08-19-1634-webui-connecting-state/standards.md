# Standards for the Web UI connecting state

No standards from `agent-os/standards/index.yml` apply directly to this work. The index covers the parent Canvas app's KMP / Kotlin / mesh / cloud architecture; `argus-webui` is a separate vanilla TypeScript + Tailwind frontend with no UI standards indexed there.

The only loosely related entry is `workflow/commit-conventions` (`<type>: <subject>`, imperative, max 72 chars, no agent-attribution trailers); it applies at commit time and is reinforced by the repo memory entry "No AI attribution in commits."

Module-local conventions that did govern the work, from `AGENTS.md`:

- Design tokens over raw hex / px literals — enforced by `npm run lint` (`scripts/lint-tokens.ts`). Components reach for Tailwind utilities backed by `src/design/tokens.json`, which is generated from the design handoff CSS.
- Vitest 3.0.0 for tests, default node environment (no jsdom) — so component logic has to be extracted to pure functions to be testable.
