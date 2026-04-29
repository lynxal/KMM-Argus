# Argus Distribution — Maven Central Publishing + Debug-Only Consumer Pattern

## Context

Argus is currently consumed by `:sample-android` via project notation (`projects.argusAndroid`) inside the same build. To let external apps adopt Argus, we need to publish artifacts to Maven Central and lock in a consumer pattern that guarantees **zero Argus classes ship in release builds** — no no-op module, just Gradle source-set splits + a consumer-side interface seam (the pattern `:sample-android` already implements via `DebugTools`).

The publishing wiring mirrors the sibling repos `KMMLogging` and `KmmPermissions`: `com.vanniktech.maven.publish` plugin, in-memory GPG signing via CI secrets, GitHub-release-triggered workflow. CI also enforces the release-APK contract using a Gradle task (`dexdump` over the assembled APK).

Phase 4 (`argus-ios`) is explicitly deferred to a later spec.

## Decisions (locked)

- **Source-set layout:** keep KMP names (`androidMain` / `androidDebug` / `androidRelease`). Seam already works in `:sample-android`.
- **Initial version:** `0.0.1` for all four artifacts.
- **APK verification:** Gradle task `verifyReleaseHasNoArgus` in `:sample-android` using `dexdump`; CI invokes it.
- **iOS:** out of scope.
- **No AI attribution** in any commit (per repo memory).

## Artifacts to publish

| Module | Coordinates |
|---|---|
| `:argus-core` | `com.lynxal.argus:argus-core:0.0.1` |
| `:argus-server-core` | `com.lynxal.argus:argus-server-core:0.0.1` |
| `:argus-webui-bundle` | `com.lynxal.argus:argus-webui-bundle:0.0.1` |
| `:argus-android` | `com.lynxal.argus:argus-android:0.0.1` |

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-29-1500-argus-distribution/` with:

- `plan.md` — copy of this file
- `shape.md` — scope, decisions, context (per shape-spec template)
- `standards.md` — full content of: `kmp/module-build-conventions`, `kmp/build-variants`, `platform/build-variants`, `validation/no-internal-apis`, `workflow/commit-conventions`
- `references.md` — pointers to:
  - `KMMLogging/logging/build.gradle.kts:81-114` (mavenPublishing DSL)
  - `KMMLogging/.github/workflows/publishToMavenCentral.yml` (CI workflow)
  - `KmmPermissions/permissions/build.gradle.kts:67-100` (sibling confirms identical pattern)
  - `argus/sample-android/.../DebugTools.kt` and `androidDebug` / `androidRelease` impls (the canonical seam)
- `visuals/` — empty (no mockups for this work)

---

## Task 2 — Add publishing plugin to root + version catalog

**Files:**
- `gradle/libs.versions.toml` — add `vanniktech-maven-publish = "0.33.0"` and a plugin alias.
- `build.gradle.kts` (root) — declare the plugin with `apply(false)`.
- `gradle.properties` — add:
  ```
  GROUP=com.lynxal.argus
  VERSION_NAME=0.0.1
  ```
  (Mirrors KMMLogging's hardcoded approach but lifted to root for shared coords; per-module blocks override `artifactId` only.)

No publishing logic at root — keep convention per module (matches KMMLogging exactly; no convention plugin).

---

## Task 3 — Wire `mavenPublishing {}` in each library module

For each of `argus-core`, `argus-server-core`, `argus-webui-bundle`, `argus-android`:

1. Apply plugins:
   ```kotlin
   id("com.vanniktech.maven.publish")
   id("signing")
   ```
2. Add `mavenPublishing { … }` block patterned **verbatim** off `KMMLogging/logging/build.gradle.kts:81-114`, substituting:
   - `coordinates("com.lynxal.argus", "<module-artifact-id>", "0.0.1")`
   - `pom.name` → "Argus <Module>"
   - `pom.url` / `scm` / `issueManagement` → `https://github.com/lynxal/argus`
   - `developers` block: same as KMMLogging (VardanK / central.repo@Lynxal.com)
   - `licenses`: MIT, pointing to repo LICENSE

`:sample-android` is **not** published (it's the canonical consumer reference, not a library).

---

## Task 4 — Lock the consumer contract on `:sample-android`

The seam already exists. This task hardens it and documents it.

**Existing files (verified working):**
- `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt` — interface, no Argus imports
- `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` — installs Argus + Ktor server
- `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` — empty StateFlow, plain HttpClient, **no `com.lynxal.argus.*` imports**

**Changes:**
1. Switch `sample-android/build.gradle.kts` from project notation to maven coordinates for the `androidDebug` source set:
   ```kotlin
   sourceSets {
       val androidDebug by getting {
           dependencies {
               implementation("com.lynxal.argus:argus-android:0.0.1")
           }
       }
       // androidRelease — no Argus dependency
   }
   ```
   (Use `mavenLocal()` during Task 5 verification; switch to Maven Central post-publish.)
2. Add a top-of-file comment in `androidRelease/.../DebugToolsImpl.kt` reaffirming the no-import invariant (already present per exploration; verify and reinforce).

---

## Task 5 — `verifyReleaseHasNoArgus` Gradle task

**File:** `sample-android/build.gradle.kts`

Register a task that:
1. Depends on `assembleRelease`.
2. Runs `${android.sdkDirectory}/build-tools/<latest>/dexdump -f` over the resulting APK's classes.dex.
3. Greps for `com/lynxal/argus/` (slash form — the dex internal name).
4. Fails the build if any class is found, prints the offending class names.

Also fail if the APK contains:
- `io/ktor/server/` (Ktor server classes)
- `com/lynxal/argus/webui/` (UI bundle)

Local invocation: `./gradlew :sample-android:verifyReleaseHasNoArgus`.

---

## Task 6 — GitHub Actions workflows

Mirror `KMMLogging/.github/workflows/` exactly, scoped to this repo.

**Files to create:**

1. `.github/workflows/buildLibrary.yml` — reusable workflow: checkout, JDK 17, validate gradle wrapper, run `./gradlew build`. Patterned on KMMLogging's equivalent.

2. `.github/workflows/publishToMavenCentral.yml` — triggers: `workflow_dispatch` + `release: [released]`. Steps copied from `KMMLogging/.github/workflows/publishToMavenCentral.yml` verbatim, with task `publishAllPublicationsToMavenCentralRepository`. Required secrets (already configured org-wide per the brief):
   - `ORG_GRADLE_PROJECT_MAVENCENTRALUSERNAME`
   - `ORG_GRADLE_PROJECT_MAVENCENTRALPASSWORD`
   - `ORG_GRADLE_PROJECT_SIGNINGINMEMORYKEY`
   - `ORG_GRADLE_PROJECT_SIGNINGINMEMORYKEYID`
   - `ORG_GRADLE_PROJECT_SIGNINGINMEMORYKEYPASSWORD`

3. `.github/workflows/verifyRelease.yml` — runs on every PR + push to `main`:
   - `./gradlew :sample-android:assembleRelease`
   - `./gradlew :sample-android:verifyReleaseHasNoArgus`
   - `./gradlew :sample-android:assembleDebug` (smoke check — does it build at all)

   This is the CI gate enforcing the acceptance criteria.

---

## Task 7 — README / docs update

Update root `README.md` (or create one if absent) with:
- Coordinates table
- Consumer snippet:
  ```kotlin
  // build.gradle.kts (Android app)
  dependencies {
      debugImplementation("com.lynxal.argus:argus-android:0.0.1")
      // NEVER releaseImplementation or implementation
  }
  ```
- Link to `:sample-android` as the canonical reference.
- Mention of the seam pattern (interface in `main`, impl per variant).

---

## Verification

End-to-end check before merging:

1. `./gradlew clean build` — all modules compile.
2. `./gradlew publishToMavenLocal` — all four artifacts appear in `~/.m2/repository/com/lynxal/argus/`.
3. Switch `:sample-android` to consume from `mavenLocal()`, repository order; rebuild.
4. `./gradlew :sample-android:assembleDebug` succeeds; install APK; verify Argus server starts on `:8787`, WebUI loads.
5. `./gradlew :sample-android:assembleRelease` succeeds.
6. `./gradlew :sample-android:verifyReleaseHasNoArgus` passes — **zero** `com/lynxal/argus/` classes; **zero** `io/ktor/server/` classes.
7. Manual: `unzip -p sample-android/build/outputs/apk/release/*.apk classes.dex | strings | grep -c lynxal/argus` → `0`.
8. Push a draft release tag (e.g., `v0.0.1-test`); confirm `publishToMavenCentral` workflow runs successfully against staging (Sonatype OSSRH).

## Critical files

- `gradle/libs.versions.toml`
- `build.gradle.kts` (root) + `gradle.properties`
- `argus-core/build.gradle.kts`
- `argus-server-core/build.gradle.kts`
- `argus-webui-bundle/build.gradle.kts`
- `argus-android/build.gradle.kts`
- `sample-android/build.gradle.kts` (verify task + dep swap)
- `.github/workflows/buildLibrary.yml`
- `.github/workflows/publishToMavenCentral.yml`
- `.github/workflows/verifyRelease.yml`
- `README.md`

## Out of scope (deferred)

- `argus-ios` artifact (Phase 4)
- Staging variant (`stagingImplementation`) — pattern documented; consumer-side concern
- Convention plugins / `buildSrc` — not used by KMMLogging, not needed here
