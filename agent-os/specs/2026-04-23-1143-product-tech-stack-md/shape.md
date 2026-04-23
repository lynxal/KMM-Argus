# Argus Tech Stack — Shaping Notes

## Scope

Replace `agent-os/product/tech-stack.md` wholesale with a detailed, module-by-module tech-stack specification for Argus. Current content is a 53-line summary; downstream specs need an authoritative reference for library versions, module types, Gradle conventions, and the webui-bundle generation pipeline.

No code changes. No Gradle edits. No standards edits. Doc-only.

## Decisions

1. **Replace wholesale** — existing `tech-stack.md` will be overwritten, not merged.
2. **Design path = `design_handoff_argus_inspector/`** — document the current folder (with `ds/` for tokens and `argus/` for component JSX references), not the aspirational `docs/design/` mentioned in the ARGUMENTS payload.
3. **Bundle size = soft target** — 100 KB gzipped is a design budget, not a build-fail ceiling. No Gradle check task.
4. **Cite synced standards** — `agent-os/standards/` is now populated from the Canvas Control / LynxMesh project. The doc cites the five applicable standards and flags two explicit divergences.

## Divergences from synced standards

| Topic | Synced standard | Argus | Reason |
| --- | --- | --- | --- |
| Android min SDK | 26 (`kmp/module-build-conventions`) | **24** | Argus is a debug-only library distributed to third-party consumers; needs broader min SDK reach than Canvas Control itself. |
| Versioning | `{major}.{minor}.{buildId}` with `System.currentTimeMillis()` (`kmp/version-management`) | **Semver (`x.y.z`)**; WebSocket hello payload carries a separate `schemaVersion` | Library-style distribution via the internal Lynxal Maven repo; consumers pin and range on semver. Wire schema compatibility is a separate concern from library version. |

All other standards (module boundaries, plugin assignment, version catalog, expect/actual file naming, `com.lynxal.<module>` package root) are adopted as-is.

## Context

- **Visuals:** None. Tech-stack is a doc artifact.
- **References:**
  - `../KMMLogging/` — confirmed Kotlin 2.2, min SDK 24, plugin-alias version catalog, `jvmToolchain(findProperty("jvm.version"))` pattern, `vanniktech.maven.publish` for releases.
  - `../KmmPermissions/` — confirmed the same KMP module + example-app layout.
- **Product alignment:**
  - `mission.md` — Argus targets Lynxal/Canvas engineers; Ktor-native, KMP-ready, unified HTTP+log timeline, debug-only.
  - `roadmap.md` — Phase 1 MVP is the six modules enumerated here; Phase 4 adds `:argus-ios`. Tech-stack's module matrix must stay consistent with the roadmap's module layout.

## Standards applied

- `kmp/module-boundaries` — Argus's module graph is strictly one-way; `:argus-core` sits at the base and no module depends on a module above it.
- `kmp/module-build-conventions` — plugin-alias version catalog, `apply false` in root build, iOS static framework default, JVM 17.
- `kmp/expect-actual-conventions` — `ArgusServer.kt` in `commonMain/`, `ArgusServer.android.kt` / `.ios.kt` as actuals.
- `kmp/version-management` — cited for contrast; Argus diverges.
- `naming/package-structure` — package root `com.lynxal.argus`, singular folder names.
