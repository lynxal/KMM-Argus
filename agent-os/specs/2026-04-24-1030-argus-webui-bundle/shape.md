# `:argus-webui-bundle` — Shaping Notes

## Scope

A new KMP module `:argus-webui-bundle` (targets: jvm, androidTarget, iosX64, iosArm64, iosSimulatorArm64) that exposes the prebuilt `argus-webui/dist/` SPA as byte-array constants in `commonMain`. Contents are gzip-compressed + base64-encoded at build time by a Gradle `generateBundle` task that walks `../argus-webui/dist/` and emits `EncodedBundle.kt` under `build/generated/argus-ui-bundle/commonMain/kotlin/`. At runtime, `ArgusUiBundle.get(path: String): BundleEntry?` returns an entry whose `bytes: ByteArray` is decoded lazily on first access. `:argus-server-core` (future) will serve these bytes unchanged through Ktor.

Also in scope: a minimal Gradle project at `argus-webui/` wrapping `npm run build` as a `:argus-webui:npmBuild` task so `generateBundle` has an explicit producer. Before this spec, `argus-webui/` was a standalone npm project with no Gradle presence; `tech-stack.md` referenced `:argus-webui:npmBuild` but it did not exist.

## Decisions

- **`:argus-webui:npmBuild` wrapper is in scope.** Unblocks end-to-end `./gradlew :argus-webui-bundle:generateBundle` in one prompt; matches the tech-stack's claim of existence.
- **Generator output at `build/generated/argus-ui-bundle/commonMain/kotlin/`.** Standard Gradle practice — already gitignored via the root `.gitignore` `build/` entry. Registered via `kotlin.sourceSets.commonMain.kotlin.srcDir(generateBundle.map { it.outputDir })`; Gradle threads an implicit `dependsOn` through to every Kotlin compile task in commonMain's closure, so no explicit `tasks.withType<KotlinCompile>().dependsOn(...)` is needed.
- **Per-entry lazy decode.** `BundleEntry.bytes` decodes (base64 → gunzip) on first access via `by lazy(LazyThreadSafetyMode.PUBLICATION)`. The `files` map of wrappers is built eagerly but each decode is deferred. Matches the `<50ms first-access` bar naturally — a single ~50 KB asset inflates in sub-millisecond on ARM, and memory scales with requests rather than the whole bundle.
- **Path keys use leading slash** (e.g. `/index.html`). The server can pass `call.request.path()` through unchanged.
- **`BundleEntry` is a regular `class`, not a `data class`.** Deviation from the literal spec wording, grounded in `bluetooth-mesh/bytearray-classes`: data classes with `ByteArray` fields have broken structural equality unless `equals`/`hashCode` are overridden via `contentEquals`/`contentHashCode` — at which point the `data` keyword is decorative. Public API shape (`bytes`, `contentType` as properties) is unchanged.
- **Generator emits a private `EncodedBundle` helper; public API is hand-written.** Only `EncodedBundle.kt` is regenerated; `ArgusUiBundle`, `BundleEntry`, `Gzip` live in `src/commonMain/` under version control. Keeps the regenerated file surface minimal and easy to diff-review.
- **Intermediate `jvmAndAndroidMain` source set for the JVM-based `gunzip` actual.** Shared between `jvmMain` and `androidMain` — avoids duplicating the four-line `GZIPInputStream` wrapper. The default KMP hierarchy template (already enabled globally via `kotlin.mpp.applyDefaultHierarchyTemplate=true`) doesn't provide this grouping, so it's created manually.
- **iOS `gunzip` parses the gzip envelope manually** (10-byte header + optional fields + 8-byte trailer) and feeds the middle (raw deflate) to Apple's `compression_decode_buffer` with `COMPRESSION_ZLIB` (which actually means raw deflate in Apple's API despite the name).
- **Content-type is baked in at generation time**, not computed at runtime. Each `EncodedEntry` carries its own `contentType` string. The inference function lives in the Gradle task only.
- **String-literal chunking at 60 000 chars.** JVM class file `CONSTANT_Utf8_info` entries cap at 65 535 bytes. Each base64 value is split and joined with `+`, safely under the cap.
- **No `build-logic/` or `buildSrc/`.** One generator task doesn't justify the complexity; inline the `abstract class GenerateBundleTask` in `argus-webui-bundle/build.gradle.kts`. Promote later if a second codegen task appears.
- **No consumable Gradle variant between `:argus-webui` and `:argus-webui-bundle`.** Cross-project `dependsOn` plus `project(":argus-webui").layout.projectDirectory.dir("dist")` as an `@InputDirectory` is sufficient for one producer / one consumer; an attribute-plumbed variant buys nothing here and doesn't match the rest of the repo.

## Context

- **Visuals:** None — this is build-system plumbing, no UI.
- **References:**
  - `argus-core/build.gradle.kts` — KMP module convention used as the template. Inline `androidTarget()` + three iOS targets + `jvm()` pattern, version-catalog plugin aliases, `android { }` block with `compileSdk`/`minSdk` from the catalog.
  - `agent-os/specs/2026-04-23-2345-argus-webui/` — the prior spec that shipped the SPA; explicitly noted `:argus-webui-bundle` as a "separate prompt" that would package its `dist/`. This is that prompt.
  - `agent-os/product/tech-stack.md` lines 23, 78-89 — authoritative description of `:argus-webui-bundle` and its generator.
  - `agent-os/product/roadmap.md` — this module is listed as Phase 1 MVP.
- **Product alignment:**
  - Phase 1 roadmap: `:argus-webui-bundle` is an explicit MVP deliverable.
  - Tech-stack: this module's spec there (`generateBundle` task, base64+gzip payload, content-type map) is honored literally; the generated file location is the one operational choice (spec said `src/commonMain/generated/`; we use `build/generated/...` for standard Gradle ergonomics).
  - Mission: "on-device server, any browser, zero filesystem dependency" — this module is the "zero filesystem dependency" half of that promise.

## Standards Applied

- **`kmp/module-build-conventions`** — plugin assignment, version catalog, iOS static framework default, JVM 17 toolchain, `compileSdk`/`minSdk` from catalog.
- **`kmp/module-boundaries`** — `:argus-webui-bundle` sits next to `:argus-core` at the base of the Argus module graph; no internal dependencies, no upward references. `:argus-server-core` (later) depends on it one-way.
- **`kmp/expect-actual-conventions`** — `Gzip.kt` in commonMain contains the `internal expect fun gunzip`. Actuals named `Gzip.jvmAndAndroid.kt` (in the shared intermediate set) and `Gzip.ios.kt` (in `iosMain`). `expect fun` chosen over `expect object`/`expect class` because there's no platform-specific state.
- **`naming/package-structure`** — package root `com.lynxal.argus.webui`; singular folder names; one top-level declaration per file (`BundleEntry.kt` → `class BundleEntry`; `ArgusUiBundle.kt` → `object ArgusUiBundle`; `Gzip.kt` → expect fun + private helpers only).
- **`naming/code-documentation`** — KDoc on the public `ArgusUiBundle` object and `BundleEntry` class explaining purpose and the lazy decode. Inline comments only where the why is non-obvious (the iOS gzip-header stripping, the 60 000-char chunk boundary). Do not annotate obvious code.
- **`bluetooth-mesh/bytearray-classes`** (adapted) — `BundleEntry` is a regular class; `equals`/`hashCode` use `contentEquals`/`contentHashCode` on the `bytes` field.
- **`workflow/commit-conventions`** — `feat(webui-bundle): …` / `chore(webui-bundle): …` conventional subjects, 72 char cap, imperative mood. No AI attribution trailers (user's standing `feedback_no_ai_attribution` memory on this repo).
