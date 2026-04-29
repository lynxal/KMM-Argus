# References for Argus Distribution

## Canonical patterns

### KMMLogging — `mavenPublishing {}` DSL

- **Location:** `../KMMLogging/logging/build.gradle.kts:81-114`
- **Relevance:** Exact DSL pattern to mirror per Argus library module.
- **Key patterns:** `publishToMavenCentral()` + `signAllPublications()`; `coordinates(group, artifactId, version)`; full POM with licenses, scm, developers, issueManagement.

### KMMLogging — Publish workflow

- **Location:** `../KMMLogging/.github/workflows/publishToMavenCentral.yml`
- **Relevance:** Triggers (`workflow_dispatch` + `release: [released]`), env-var convention, `publishAllPublicationsToMavenCentralRepository` task target on `macos-latest`.
- **Key patterns:** Reuses `buildLibrary.yml`; matrix-with-fail-fast; environment `Release`; 15-minute timeout.

### KMMLogging — Build workflow

- **Location:** `../KMMLogging/.github/workflows/buildLibrary.yml`
- **Relevance:** Reusable workflow (`workflow_call`) invoked by the publish workflow.

### KmmPermissions — Sibling using identical pattern

- **Location:** `../KmmPermissions/permissions/build.gradle.kts:67-100`
- **Relevance:** Confirms the KMMLogging pattern is the org-wide convention. Identical plugin, env vars, POM shape — only `coordinates()` and URLs differ.

## In-repo seam (already working)

### `:sample-android` — DebugTools interface seam

- **Location:** `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt`
- **Relevance:** Canonical interface — no Argus imports. Methods: `buildHttpClient()`, `installLogging()`, `observeArgusUrl()`.
- **Key patterns:** Interface in `androidMain`; per-variant impl supplies the seam.

### `:sample-android` — Debug impl

- **Location:** `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
- **Relevance:** Wires Argus + Ktor server (port 8787); installs logger delegate.

### `:sample-android` — Release impl

- **Location:** `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
- **Relevance:** No `com.lynxal.argus.*` imports. Empty `StateFlow<String?>`, plain `HttpClient`, no-op logging install. Top-of-file comment enforces invariant.

## Product roadmap

- **Location:** `agent-os/product/roadmap.md`
- **Relevance:** Phase 1 explicitly mandates the distribution model implemented by this spec. No no-op module by design.
