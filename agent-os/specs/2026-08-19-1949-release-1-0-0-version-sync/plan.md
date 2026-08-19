# Release 1.0.0 — bump the version and kill the drift

Implements [issue #8](https://github.com/lynxal/KMM-Argus/issues/8).

## Context

`gradle.properties:16` is documented as the "single source of truth for argus library version", and the seven module `coordinates(…)` calls really do read it. Everything else was typed by hand and has drifted into **four different "current versions"**:

| Surface | Value |
|---|---|
| `gradle.properties:16` `argus.version` | `0.0.3` |
| `argus-android/build.gradle.kts:40` `BuildConfig.ARGUS_VERSION` | `0.1.0` — hardcoded |
| `argus-ios/.../ios/AppInfoBuilder.kt:21` `private const val ARGUS_VERSION` | `0.1.0` — hardcoded, **the issue missed this one** |
| `README.md` (11 coordinates + status row), `argus-webui/package.json`, `Package.swift` URL, `AGENTS.md:94` | `0.0.2` |
| Git tags | `0.0.1`, `0.0.2`, `0.0.3` |

`0.0.3` was tagged and nothing else followed. The runtime consequence is real: both `AppInfoBuilder`s feed `AppInfo.argusVersion` → `GET /api/info` (`routes/Info.kt:28`) and the WebSocket `hello` frame (`routes/Ws.kt:23`), so Argus reports a library version — `0.1.0` — that was never released and doesn't match the artifact the host app links. (Blast radius is narrower than it looks: `TopBar.ts:165-175` shows `pkg · versionName · device` and never renders `argusVersion`, so today the wrong value only shows up in the JSON and the hello payload.)

Two more defects surfaced while scoping:

- **The repo path is wrong in 28 places.** All 7 module POMs set `url`/`scm`/`issueManagement` to `https://github.com/lynxal/argus`, which 404s (verified via `gh api`). This repo is `lynxal/KMM-Argus`. That metadata ships to Maven Central with 1.0.0.
- **`Package.swift` cannot work.** `:26` points at `lynxal/argus` under tag `v0.0.2` (tags carry no `v` prefix), and `:27`'s checksum is the literal `PLACEHOLDER_REPLACE_PER_RELEASE`. `gh release list` is empty — no asset exists at any version.

Outcome: one source of truth, every derivable surface generated from it, every hand-written surface guarded by a build gate that fails on drift, and `1.0.0` tagged and released.

## Decisions made during shaping

| Question | Decision |
|---|---|
| Version | `1.0.0` |
| Tag format | `1.0.0`, no `v` prefix — matches all three existing tags. `Package.swift`'s `v` was the bug, so its URL becomes `releases/download/1.0.0/…`. |
| Wrong repo URL | Fix in live files (7 POMs, `Package.swift`, `README`, `AGENTS.md`, `publishToMavenCentral.yml:73`). Archived `agent-os/specs/**` left alone. |
| Drift prevention | Root `verifyVersionPins` task wired into `verify.yml`, **plus** a Release section in `AGENTS.md`. |
| SPM checksum | CI stays the uploader. Tag with the URL fixed and the placeholder still in place; after the release workflow prints the real checksum, a follow-up commit on `main` lands it. `Package.swift` is knowingly wrong at the `1.0.0` tag, correct on `main`. The gate does **not** validate the checksum. |
| `argus-webui/package.json` | Tracks the library version → `1.0.0`, covered by the gate. (It has zero runtime effect — `argus-webui/src` never reads it and `vite.config.ts` has no `define`. Tidiness only.) |
| LICENSE | Add a real MIT `LICENSE` (the POMs already claim MIT) and rewrite `README.md:865`. |
| Web UI version | **Changed mid-implementation:** the version is now shown. `DeviceInfo` carries `argusVersion` and the TopBar renders `Argus (1.0.0)`. Both versions are parenthesised against their own label so the library version can't be confused with the host app's. Covered by `scripts/probe-webui/version-probe.js`. |
| Connection dot | Fixed in passing: `.ds-conn-dot` set `width`/`height` on a bare `<span>`, which `display: inline` ignores — the TopBar dot was 0×0 and the pill's `gap-2` read as off-centre text. `display: inline-block`, asserted by measured box. |
| Release trigger | Create the GitHub Release, which fires Maven Central publish. **Irreversible — I will ask for an explicit go-ahead at that step; approving this plan is not that approval.** |
| Left alone | Sample app `0.0.1`; `ARGUS_SCHEMA_VERSION` stays `2` (separate axis by design, `Schema.kt:9-10`); test fixtures at `0.1.0`/`0.2.1` (a fixture equal to the real version would mask a hardcoding bug); dead `HelloPayload.serverVersion` (populating it is a wire change). |

## Feasibility check: can the runtime version come from one place?

**Yes — via BuildKonfig.** `:argus-core` applies `com.codingfeline.buildkonfig`
(pinned to `0.21.2`, the release built against this repo's Kotlin 2.3.21) and
generates `ArgusBuildKonfig.ARGUS_VERSION` from the property in ~10 lines.
`exposeObjectWithName` is required: the default generated object is `internal`,
which `:argus-android` and `:argus-ios` cannot see across module boundaries.

Do **not** bump to `0.22.0`. It targets Kotlin 2.4.0, and because the plugin is
declared in the root `plugins {}` block its newer `kotlin-stdlib` reaches the
shared buildscript classpath, where `:sample:lintVitalAnalyzeRelease` emits
*"metadata is 2.4.0, expected 2.2.0"* and stops analysing while still reporting
BUILD SUCCESSFUL — a release gate going quiet with CI green.

### The rejected alternative, kept for reference

A hand-rolled `GenerateArgusVersionTask` was built first and worked (generator
correct, up-to-date checking correct, both platforms compiling). It was replaced
because ~70 lines of build script for one string does not pay for itself. The
pattern remains the right reference for any other codegen here: `argus-webui-bundle/build.gradle.kts:64-172` already generates Kotlin source from a Gradle task and wires it in via `kotlin.sourceSets.named("commonMain") { kotlin.srcDir(task.map { it.outputDir }) }` — at the *identical* target set as `argus-core` (`androidTarget`, three iOS targets with `binaries.framework`, `jvm`, `applyDefaultHierarchyTemplate`, hand-made `jvmAndAndroidMain`), and it's already published to Maven Central. Anything that would break for a version constant already breaks for `EncodedBundle.kt`.

Confirmed by the design pass: the srcDir dependency is inferred into `compileCommonMainKotlinMetadata`, all three `compileKotlinIos*`, both Android variant compiles, and `compileKotlinJvm`; test compiles inherit it transitively through the main compile's klib/classes. SQLDelight's own `commonMain` srcDir doesn't interact — `SourceDirectorySet.srcDir` is additive and each entry carries its own dependency.

Docs, `package.json`, and `Package.swift` cannot read a Gradle property, so they stay hand-written and are covered by the gate instead.

**Four corrections the design pass insisted on** (each is a silent-failure trap):

1. **`@get:Input` on the version string is non-negotiable.** The precedent task has only an `@InputDirectory`. Copying it verbatim gives a task that is `UP-TO-DATE` after a version bump and ships the stale constant — the same bug, now invisible because nothing is hardcoded anywhere.
2. **`tasks.withType<Jar>().configureEach { dependsOn(generateArgusVersion) }`.** KGP's per-target `*SourcesJar` tasks have historically read `srcDirs` eagerly, which drops the generated-source dependency and fails the build under Gradle 8. Unverifiable locally (no build output in the tree), and the task is a ~1 ms file write, so declare it rather than gamble.
3. **Parse the npm JSON, don't regex it.** `argus-webui/package-lock.json:1923` has `"version": "0.0.2"` inside `node_modules/stackback` at *exactly the same 6-space indent* as the real `packages[""]` entry at `:9`. Indent-based disambiguation is impossible; use `groovy.json.JsonSlurper` (on the Gradle script classpath).
4. **Root `build.gradle.kts` has no `base` plugin**, so `tasks.named("check")` at root throws `UnknownTaskException`. Registering a task there is fine; hook it from `sample/build.gradle.kts:280-283`'s existing `check` block plus the `verify.yml` arguments list — the way the repo already wires its two other gates.

## Tasks

### Task 1 — Save spec documentation

Create `agent-os/specs/2026-08-19-1949-release-1-0-0-version-sync/` with:

- `plan.md` — this plan.
- `shape.md` — scope, the decision table, and why the drift happened.
- `standards.md` — `agent-os/standards/workflow/commit-conventions.md` is the only relevant standard; the other 16 categories are parent-Canvas-app concerns (BLE mesh, SignalR, Koin).
- `references.md` — the two in-repo patterns being copied: `argus-webui-bundle/build.gradle.kts:64-172` (task-generated Kotlin source wired into `commonMain`) and `sample/build.gradle.kts:136` (`group = "verification"` gate that `error(…)`s with a file list). Also `agent-os/specs/2026-04-24-1700-argus-android/shape.md:51,67`, which deferred this exact item — this change closes it.

No `visuals/` — none provided.

### Task 2 — Single source of truth for the runtime version

- `gradle.properties:16` → `argus.version=1.0.0`.
- `argus-core/build.gradle.kts` — append after the `android { }` block, before `mavenPublishing`: an `abstract class GenerateArgusVersionTask : DefaultTask()` with `@get:Input argusVersion: Property<String>` and `@get:OutputDirectory outputDir: DirectoryProperty`, writing `com/lynxal/argus/model/ArgusVersion.kt` — first line `// GENERATED FILE — DO NOT EDIT`, then `public const val ARGUS_VERSION: String`. Register it (`argusVersion.set(providers.gradleProperty("argus.version"))`, output under `layout.buildDirectory.dir("generated/argus-version/commonMain/kotlin")`), add the srcDir, add the `Jar` `dependsOn`. Write the action config-cache-clean (no `project` capture) even though `org.gradle.configuration-cache=false` today. KDoc notes it's distinct from `ARGUS_SCHEMA_VERSION` and that `const val` inlines into consumers' bytecode — fine because all seven modules publish in lockstep from one property.
- `argus-android/build.gradle.kts` — delete `buildConfigField(…)` at `:40` **and** the now-dead `buildFeatures { buildConfig = true }` block. Safe: `BuildConfig` has exactly three references tree-wide, all removed by this change.
- `argus-android/src/androidMain/.../AppInfoBuilder.kt:18` — `BuildConfig.ARGUS_VERSION` → `ArgusBuildKonfig.ARGUS_VERSION`.
- `argus-ios/src/iosMain/.../AppInfoBuilder.kt` — add the import, delete the `private const val` at `:21`. Line 17 is textually unchanged; the reference just re-resolves.
- `argus-android/src/androidUnitTest/.../AppInfoBuilderTest.kt:22-26` — won't compile once `BuildConfig` is gone, and `assertEquals(X, X)` was tautological anyway. Rewrite as a test that can fail: keep `assertEquals(ARGUS_VERSION, info.argusVersion)` as a wiring assertion (it catches a reintroduced literal) and add a semver-shape check. Agreement with `gradle.properties` is enforced by `verifyVersionPins`, not by a unit test — a unit test can't read the property.
- `argus-ios/src/iosTest/.../AppInfoBuilderTest.kt` — no change needed (`isNotBlank()` still compiles and passes).

Do **not** add `export(projects.argusCore)` to `argus-ios`'s `XCFramework`. Core isn't exported today, so this change produces zero Objective-C header churn in the published XCFramework — that's the desired outcome.

**Fallback, only if the sources-jar check in Verification turns up a dependency problem that can't be fixed cleanly:** hand-write `ArgusVersion.kt` in `commonMain` and let `verifyVersionPins` assert it equals `argus.version`. Zero codegen risk, one extra manual edit per release, and the gate makes drift impossible either way. This is a fallback, not a redesign.

### Task 3 — Correct the wrong repo path

Replace `github.com/lynxal/argus` → `github.com/lynxal/KMM-Argus` in the `pom { url / licenses.url / issueManagement.url / scm }` blocks of all 7 module build files (`argus-core`, `argus-server-core`, `argus-webui-bundle`, `argus-android`, `argus-ios`, `argus-okhttp`, `argus-urlconnection`), plus `README.md`, `AGENTS.md`, and `.github/workflows/publishToMavenCentral.yml:73`. Leave `agent-os/specs/**`.

### Task 4 — Sync the hand-written pins to 1.0.0

- `README.md` — status row `:21`, dependency snippets `:49-50`, the SPM/KMP note `:351`, the staging snippet `:594`, and all 7 module-table rows `:830-836`.
- `AGENTS.md:94` — replace the literal `argus = "0.0.2-SNAPSHOT"` with a placeholder like `argus = "<argus.version>-SNAPSHOT"`. The sentence already says "or whatever `argus.version` is set to", so the literal adds nothing and is a drift surface the coordinate regex can't even see (it isn't in `group:artifact:version` form). Removing it beats gating it.
- `argus-webui/package.json:3` and `package-lock.json` root + `packages[""]` entries → `1.0.0`.
- `Package.swift:26` — repo path fixed, `v0.0.2` → `1.0.0` (no `v`). Checksum stays the placeholder until Task 8.
- `agent-os/product/tech-stack.md:14` — drop the "(currently `0.0.3`)" parenthetical so the doc stops needing a bump at all.
- Root `package.json` stays `argus-docs-tooling` at `0.0.0` per the issue.

### Task 5 — Add the MIT LICENSE

Add a standard MIT `LICENSE` at the repo root matching what the 7 POMs already declare, and rewrite `README.md:865` from "not yet declared … will land before `1.0.0`" to state MIT and link the file.

### Task 6 — `verifyVersionPins` drift gate

Register `verifyVersionPins` in root `build.gradle.kts` (`group = "verification"`), modeled on `sample/build.gradle.kts:136`. Reads `argus.version`, collects every mismatch, and throws once with a `file:line` list plus a pointer to the generator. Rules:

| Surface | Check |
|---|---|
| `README.md`, `AGENTS.md` | `com\.lynxal\.argus:[a-z0-9-]+:(\d+\.\d+\.\d+(?:-SNAPSHOT)?)` — 11 hits, `-SNAPSHOT` tolerated. Correctly skips `AGENTS.md:82-83`, which are `substitute(module("com.lynxal.argus:argus-android"))` strings with no version segment. |
| `README.md` status row | `^\|\s*Version\s*\|\s*` + backtick capture — exactly one hit, `:21`. |
| `Package.swift` | `releases/download/(\d+\.\d+\.\d+)/argus_ios\.xcframework\.zip` — note **no `v`**, per the tag decision. |
| npm manifests | `JsonSlurper` on `argus-webui/package.json` (`version`) and `package-lock.json` (`version` **and** `packages[""].version`). Never regex — see correction 3. |

Each rule also fails when it matches **zero** lines, so a regex that rots is caught instead of silently passing. Explicitly excluded: root `package.json`/`package-lock.json` (`argus-docs-tooling` at `0.0.0`), `scripts/probe-webui/**`, `sample/build.gradle.kts:89`, `agent-os/specs/**`.

Add a **re-drift guard** in the same task — a `fileTree` over `**/*.kt`/`**/*.kts` (excluding `**/build/**`, `**/node_modules/**`, `agent-os/**`) failing on any hit for a hand-written `ARGUS_VERSION\s*(?::\s*String\s*)?=\s*"` or a returning `buildConfigField(… "ARGUS_VERSION")`. The generated file lives under `build/`, so there are zero legitimate hits. This is what turns "we fixed the drift" into "the drift can't come back," and it's worth more than the doc pins.

Wire it in two places: `dependsOn(rootProject.tasks.named("verifyVersionPins"))` inside `sample/build.gradle.kts`'s existing `tasks.named("check")` block, and `:verifyVersionPins` first in `.github/workflows/verify.yml`'s `arguments:` list (pure file read, fails fastest).

**Residual gap to name, not solve here:** `publishToMavenCentral.yml:73` builds the SPM URL from `${{ github.event.release.tag_name }}`, and nothing enforces `tag == argus.version`. The gate can't see the git tag locally. The Release checklist covers it by hand.

### Task 7 — Release checklist in AGENTS.md

New `## Release` section between "Local development against a consumer project" and "Reference": bump `argus.version`; run `./gradlew verifyVersionPins`; dispatch both Verify workflows against `main` (they're `workflow_dispatch`, so neither fires at release time — `publishToMavenCentral.yml:11-14`); tag `<version>` with **no `v` prefix, matching `argus.version` exactly**; create the Release to trigger publish; paste the printed checksum into `Package.swift:27`.

### Task 8 — Ship it

1. Commit in task order per `agent-os/standards/workflow/commit-conventions.md` (no attribution trailers). The Task 2 commit message references the deferred item in `agent-os/specs/2026-04-24-1700-argus-android/shape.md:51,67` that it closes.
2. `./gradlew :verifyVersionPins jvmTest testDebugUnitTest testReleaseUnitTest :argus-okhttp:test :argus-urlconnection:test :sample:assembleDebug :sample:verifyReleaseHasNoArgus` — must pass before pushing.
3. Push the branch, open the PR against `main`.
4. Update issue #8: target version is `1.0.0`, plus the iOS hardcode it missed, the 28 wrong POM URLs, the missing LICENSE, and the decisions above.
5. ~~File a follow-up issue for the Web UI version chip~~ — done in this PR instead. The remaining design-parity gap is the status bar itself (event count, shortcut hints), not the version.
6. After merge: dispatch both Verify workflows against `main`, then `git tag 1.0.0 && git push origin 1.0.0`.
7. **Stop and ask.** Creating the Release publishes 7 artifacts to Maven Central, which cannot be deleted or replaced. Only on an explicit go-ahead: `gh release create 1.0.0`.
8. Read the checksum from the release notes, commit it into `Package.swift:27` on `main`, and confirm the asset URL resolves.

## Verification

- **`./gradlew :verifyVersionPins` in both directions** — passes on the finished tree, and fails with the right `file:line` when a pin is edited to a wrong value. A green-only check proves nothing.
- **`./gradlew -Pargus.localSnapshot=true :argus-core:publishToMavenLocal`, then unzip `~/.m2/…/argus-core-1.0.0-SNAPSHOT-sources.jar`** and confirm `ArgusVersion.kt` is inside. This is the single highest-value check of the whole change — it's the one link the `argus-webui-bundle` precedent doesn't prove locally. **Needs explicit approval before running** (it publishes, even if only locally).
- **Bump-detection:** edit `argus.version`, re-run, confirm `generateArgusVersion` is **not** `UP-TO-DATE` and the constant changes. This is what correction 1 protects.
- `./gradlew :argus-android:testDebugUnitTest --tests '*AppInfoBuilderTest*'` — Android reports `1.0.0`.
- `./gradlew :argus-ios:iosSimulatorArm64Test --tests '*AppInfoBuilderTest*'` — iOS compiles against core's constant.
- **End-to-end:** run the sample on a device and `curl http://<device>:8787/api/info` — `argusVersion` must read `1.0.0`, not `0.1.0`. The unit tests are tautological in isolation; this is the actual proof.
- `grep -rn "lynxal/argus\b"` over live files returns nothing (`gh api repos/lynxal/KMM-Argus` already returns 200).
