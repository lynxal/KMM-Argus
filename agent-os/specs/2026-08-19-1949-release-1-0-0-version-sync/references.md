# References for Release 1.0.0 — version sync

## Similar Implementations

### BuildKonfig — the mechanism actually used

- **Location:** `argus-core/build.gradle.kts` (`buildkonfig { … }`), plugin
  pinned in `gradle/libs.versions.toml`.
- **Relevance:** Generates `ArgusBuildKonfig.ARGUS_VERSION` from the
  `argus.version` property in ~10 lines. `exposeObjectWithName` is required —
  the default object is `internal`, which `:argus-android` and `:argus-ios`
  could not see across module boundaries.
- **Version pinning:** check the plugin POM's `kotlin-gradle-plugin` version
  against this repo's Kotlin before bumping. See `shape.md` for what goes wrong
  when they disagree.

### Task-generated Kotlin source wired into `commonMain` (the rejected alternative)

- **Location:** `argus-webui-bundle/build.gradle.kts:64-172`
- **Relevance:** The pattern a hand-rolled `GenerateArgusVersionTask` copied
  before BuildKonfig replaced it. Still the reference for any *other* codegen this
  repo needs, and a strictly harder instance of the same problem — it
  generates megabytes of base64 rather than one constant. Critically it declares
  the *identical* target set to `argus-core`: `androidTarget()`, `iosX64()`,
  `iosArm64()`, `iosSimulatorArm64()` with `binaries.framework`, `jvm()`,
  `applyDefaultHierarchyTemplate()`, and a hand-made `jvmAndAndroidMain`
  intermediate source set. It is already published to Maven Central, so anything
  that would break for a generated version constant already breaks for
  `EncodedBundle.kt`.
- **Key patterns:**
  - `abstract class GenerateBundleTask : DefaultTask()` with annotated inputs
    and an `@get:OutputDirectory outputDir: DirectoryProperty`.
  - `tasks.register<…>("generateBundle")` with `group = "build"`.
  - `kotlin.sourceSets.named("commonMain") { kotlin.srcDir(task.map { it.outputDir }) }`
    at top-level script scope — which runs before SQLDelight's `afterEvaluate`
    wiring, so the two `srcDir` entries can't clobber each other.
  - `// GENERATED FILE — DO NOT EDIT` as line 1 of the emitted file (`:96`).
- **What NOT to borrow:** its only input annotation is `@get:InputDirectory`
  (`:65-70`). A version generator with no `@get:Input` on the version string is
  `UP-TO-DATE` after a bump and silently emits the stale constant — the exact
  bug this change exists to fix, made harder to see because nothing is
  hardcoded anywhere. `@get:Input` is mandatory.

### Verification task that fails with a file list

- **Location:** `sample/build.gradle.kts:136` (`verifyReleaseHasNoArgus`)
- **Relevance:** The shape `verifyVersionPins` follows.
- **Key patterns:** `group = "verification"`; all work in `doLast`; collect every
  offender before failing; `error(…)` with a multi-line message that names each
  offender and truncates a long list; `logger.lifecycle(…)` on success so a
  passing run is visible in CI output (`:185`).
- **Wiring note:** root `build.gradle.kts` has no `base`/`lifecycle-base`
  plugin, so `tasks.named("check")` at root throws `UnknownTaskException`.
  `sample/build.gradle.kts:280-283` already has a `check` block to hang the new
  gate off, and `.github/workflows/verify.yml:36-43` lists gates explicitly in
  its `arguments:` block.

### The deferred item this change closes

- **Location:** `agent-os/specs/2026-04-24-1700-argus-android/shape.md:51,67`
- **Relevance:** Recorded the hardcoded `BuildConfig.ARGUS_VERSION` as known
  debt: *"Bump by hand on release-branch cuts until a repo-root version source
  of truth exists."* That source of truth exists, so this change retires the
  item. The historical spec is left unedited.

### Where the design put the version

- **Location:** `design_handoff_argus_inspector/argus/Inspector.jsx:81` and
  `argus/TopBar.jsx:34`
- **Relevance:** The design shows `Argus 1.0.0` in a **status bar** the
  implementation never built, and an unlabelled app badge
  (`com.example.app · 1.4.2 · Pixel 8`) in the TopBar. The badge is unlabelled
  only because nothing competed with it — put both versions in the same bar and
  neither can be identified. Hence the parenthesised form in `TopBar.ts`, which
  keeps the design's badge layout while removing the ambiguity. Building the
  status bar (event count, shortcut hints) remains a design-parity gap.
