# Plan: Author `agent-os/product/tech-stack.md` for Argus

## Context

Argus is a Kotlin-first, Ktor-native, KMP-ready on-device HTTP + log inspector. Its `agent-os/product/` folder already has `mission.md` and `roadmap.md`, plus a short 53-line `tech-stack.md` that reads as a summary rather than a specification. Downstream work (implementing the `:argus-webui-bundle` generator, choosing concrete library versions, wiring Ktor server + `:lantern-android`, and onboarding iOS in Phase 4) needs a canonical, module-by-module tech-stack reference — otherwise every spec will re-derive choices from scratch. This task replaces the current summary with a detailed, authoritative tech-stack document, using the ARGUMENTS payload as the source of truth and reconciling it with the newly-synced `agent-os/standards/` (Canvas Control / LynxMesh) conventions.

## Shaping decisions (confirmed with user)

1. **Replace wholesale.** Overwrite `agent-os/product/tech-stack.md`; no merge with the existing summary.
2. **Design path = current folder.** Reference `design_handoff_argus_inspector/` (with its `ds/` and `argus/` subfolders) rather than the aspirational `docs/design/`.
3. **Bundle size = soft target.** 100 KB gzipped is a design budget, not a build-fail ceiling. No Gradle check task required now.
4. **Standards are now synced** — the spec cites applicable KMP + naming standards and flags two explicit divergences (min SDK, version format).

## Divergences from synced standards (must be called out in the doc)

| Topic | Synced standard | Argus | Reason |
| --- | --- | --- | --- |
| Android min SDK | 26 (`kmp/module-build-conventions`) | **24** | Argus is a debug-only library; broader min SDK reach than Canvas app itself. |
| Versioning | `{major}.{minor}.{buildId}` via `currentTimeMillis()` (`kmp/version-management`) | **Semver (`x.y.z`)**; schema version tracked separately in the WebSocket hello payload | Library-style distribution via the internal Lynxal Maven repo; consumers pin semver. |

Other standards (module boundaries, plugin assignment, expect/actual naming, version catalog, package root) are adopted as-is.

## Spec folder

```
agent-os/specs/2026-04-23-1143-product-tech-stack-md/
├── plan.md         # This file
├── shape.md        # Shaping notes (scope, decisions, divergences)
├── standards.md    # Cited standards (full content inlined)
├── references.md   # Pointers to reference implementations studied
└── visuals/        # (empty — no mockups for a doc task)
```

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-23-1143-product-tech-stack-md/` and populate `plan.md`, `shape.md`, `standards.md`, `references.md`, and an empty `visuals/` directory.

## Task 2 — Replace `agent-os/product/tech-stack.md`

Overwrite `agent-os/product/tech-stack.md`. The doc must be scannable (headings + short tables) and authoritative; use the ARGUMENTS payload as the source of truth.

### Required sections

1. **Overview** — one-paragraph statement that Argus is a Kotlin/Ktor KMP library with an embedded Ktor server and a static SPA, debug-only distribution, Phase 4 iOS.
2. **Language & Build** — Kotlin 2.x, Gradle Kotlin DSL, version catalog. Package root `com.lynxal.argus`. Min SDK 24 (with divergence note). JVM 17. Semver distribution (with divergence note).
3. **Module Matrix** — six modules with Type, Targets, Purpose, Key Dependencies + a short one-way dependency diagram consistent with `kmp/module-boundaries`.
4. **Core (KMP) — `:argus-core`** — Kotlin 2.x, `kotlinx.coroutines` 1.8+, `kotlinx.serialization` JSON, Ktor client + `createClientPlugin`, `com.lynxal.logging:logging`.
5. **Server-Core (KMP) — `:argus-server-core`** — Ktor server core, depends on `:argus-core` + `:argus-webui-bundle`, `expect class ArgusServer` per `kmp/expect-actual-conventions`.
6. **Android — `:argus-android`** — Min SDK 24, Ktor Server CIO, `:lantern-android` for mDNS.
7. **Web UI — `:argus-webui`** — Vanilla TS + Vite, Tailwind, `@preact/signals-core`, design tokens/specs from `design_handoff_argus_inspector/`, soft 100 KB gzipped bundle target.
8. **webui-bundle generation — `:argus-webui-bundle`** — `generateBundle` Gradle task (4 numbered steps); `compileKotlin` depends on it.
9. **Build conventions** — Gradle Kotlin DSL, `apply false` plugin declarations, version catalog, iOS static framework default, internal Lynxal Maven repo.
10. **Distribution** — Debug-only via `debugImplementation`; `releaseImplementation` unsupported; no no-op module by design.
11. **Applicable standards** — bulleted list with one-line relevance notes.

## Task 3 — Verify

- Confirm all six modules appear with correct type/targets.
- Confirm both standards divergences are called out with reasons.
- Confirm the `generateBundle` task has its four numbered steps exactly.
- Confirm bundle target is soft (not build-failing).
- Confirm design path is `design_handoff_argus_inspector/`.
- Confirm spec folder has all five artifacts.
- Cross-check `roadmap.md` module list for consistency (flag only; don't edit).

## Out of scope

- Writing/editing implementation code, Gradle files, or `settings.gradle.kts`.
- New standards entries.
- Moving `design_handoff_argus_inspector/` to `docs/design/`.
- Adding a bundle-size-check Gradle task.
- Editing `roadmap.md` or `mission.md`.
