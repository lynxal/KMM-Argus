# `:argus-webui-bundle` — Implementation Plan

## Context

Argus is a Kotlin Multiplatform on-device Ktor + log inspector. Phase 1 of the product roadmap (`agent-os/product/roadmap.md`) ships an embedded Ktor server that serves a static SPA and streams events to any browser on the LAN. The SPA source (TS + Vite + Tailwind) was delivered in the prior spec `agent-os/specs/2026-04-23-2345-argus-webui/`; its build output lives at `argus-webui/dist/`.

This spec packages that `dist/` directory as byte-array constants inside a new KMP module `:argus-webui-bundle`, so that `:argus-server-core` (future) can serve the SPA identically on jvm/android/ios without any filesystem dependency at runtime. Target product decisions from `agent-os/product/tech-stack.md` lines 23 and 78-89 are honored exactly. This also adds the thin Gradle wrapper `:argus-webui:npmBuild` that the tech-stack already references but that did not yet exist.

The outcome: `./gradlew :argus-webui-bundle:build` produces a KMP library whose `ArgusUiBundle.files: Map<String, BundleEntry>` is a pure-Kotlin in-process copy of the SPA, with content-types baked in, decoded per-entry lazily.

---

## Task 1: Register modules in `settings.gradle.kts`

Modify `settings.gradle.kts`: add `include(":argus-webui")` and `include(":argus-webui-bundle")` alongside the existing includes. Keep `enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")` at the top — the future `:argus-server-core` will consume this module via `projects.argusWebuiBundle`.

---

## Task 2: Author `argus-webui/build.gradle.kts`

A plain Gradle project with `plugins { base }` (no KMP, no Kotlin — there is no Kotlin source here). Two `Exec` tasks:

- **`npmCi`** — runs `npm ci` in `projectDir`. Inputs: `package.json`, `package-lock.json`. Outputs: `node_modules` directory.
- **`npmBuild`** — runs `npm run build` in `projectDir`. `dependsOn(npmCi)`. Inputs: `package.json`, `package-lock.json`, `src/`, `scripts/`, `index.html`, `tailwind.config.ts`, `vite.config.ts`, `postcss.config.js`, `tsconfig.json`. Outputs: `dist/` directory.

Wire `tasks.named("assemble") { dependsOn(npmBuild) }` and extend `clean` to also delete `dist` and `node_modules/.vite`.

The pure-path reference (no consumable variant) keeps the module wiring consistent with the rest of this repo, which has no `build-logic/` and no attribute-based artifact plumbing.

---

## Task 3: Author `argus-webui-bundle/build.gradle.kts`

Plugins: `alias(libs.plugins.kotlinMultiplatform)`, `alias(libs.plugins.androidLibrary)`.

Follow the `argus-core/build.gradle.kts` convention exactly (the reference pattern in this repo):

- Targets: `androidTarget()`, `jvm()`, `iosX64()`, `iosArm64()`, `iosSimulatorArm64()`. iOS frameworks with `baseName = "argus-webui-bundle"` and `isStatic` toggled by `-PuseStaticFramework` (default `true` per `agent-os/product/tech-stack.md`).
- Source sets:
  - `commonMain` — no external dependencies (stdlib only).
  - `commonTest` — `implementation(kotlin("test"))`.
  - `jvmAndAndroidMain by creating { dependsOn(commonMain) }` — intermediate source set holding the shared JVM-based gunzip actual.
  - `getByName("jvmMain").dependsOn(jvmAndAndroidMain)` and `getByName("androidMain").dependsOn(jvmAndAndroidMain)`.
  - Do NOT call `applyDefaultHierarchyTemplate()` explicitly — the repo's `gradle.properties` already sets `kotlin.mpp.applyDefaultHierarchyTemplate=true` globally.
- `compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }` for cross-module consistency.
- `android { namespace = "com.lynxal.argus.webui" }`, compileSdk/minSdk from the version catalog, Java 17, `jvmToolchain((findProperty("jvm.version") as String).toInt())`.

Then define the generator task (see Task 4) and wire its output into the common source set:
```kotlin
val generateBundle = tasks.register<GenerateBundleTask>("generateBundle") { /* ... */ }
kotlin.sourceSets.named("commonMain") { kotlin.srcDir(generateBundle.map { it.outputDir }) }
```
`srcDir(TaskProvider)` is enough — Gradle 8.x threads an implicit `dependsOn` through to every Kotlin compile task in commonMain's closure.

---

## Task 4: Implement the `GenerateBundleTask`

Declared inline in `argus-webui-bundle/build.gradle.kts`:

```kotlin
abstract class GenerateBundleTask : DefaultTask() {
    @get:InputDirectory @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val distDir: DirectoryProperty
    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty
    @TaskAction fun run() { /* see algorithm below */ }
}
```

Configuration:
- `distDir.set(project(":argus-webui").layout.projectDirectory.dir("dist"))`
- `outputDir.set(layout.buildDirectory.dir("generated/argus-ui-bundle/commonMain/kotlin"))`
- `dependsOn(project(":argus-webui").tasks.named("npmBuild"))` (explicit for readability).

Algorithm:
1. Resolve `outRoot = outputDir.get().dir("com/lynxal/argus/webui").asFile.toPath()`. Delete its contents, recreate.
2. `Files.walk(distRoot)` → for each regular file:
   - `key = "/" + distRoot.relativize(path).toString().replace(File.separatorChar, '/')`
   - Read bytes → gzip (`GZIPOutputStream`, default compression) → base64 (`java.util.Base64.getEncoder()`).
   - Infer content-type from extension: `.html`→`text/html; charset=utf-8`, `.js`→`application/javascript; charset=utf-8`, `.css`→`text/css; charset=utf-8`, `.json`→`application/json`, `.svg`→`image/svg+xml`, `.png`→`image/png`, `.jpg`/`.jpeg`→`image/jpeg`, `.ico`→`image/x-icon`, `.woff2`→`font/woff2`, fallback `application/octet-stream`.
3. Sort entries by key (deterministic diffs).
4. Emit `EncodedBundle.kt` via `StringBuilder` (no KotlinPoet dep). Chunk every base64 value at 60 000 UTF-8 bytes joined with `+`, so no single Kotlin string literal exceeds the JVM 65 535-byte UTF-8 constant-pool cap.

Generated file shape:
```kotlin
// GENERATED FILE — DO NOT EDIT
package com.lynxal.argus.webui

internal class EncodedEntry(val contentType: String, val b64Gzip: String)

internal object EncodedBundle {
    val entries: Map<String, EncodedEntry> = mapOf(
        "/index.html" to EncodedEntry(
            "text/html; charset=utf-8",
            "H4sIAAAA..." + // ≤60 000 chars
            "..." // next chunk if any
        ),
        // ... sorted alphabetically by key
    )
}
```

---

## Task 5: Hand-written `commonMain` runtime code

**`BundleEntry.kt`** (commonMain):
```kotlin
package com.lynxal.argus.webui

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

class BundleEntry internal constructor(private val encoded: EncodedEntry) {
    val contentType: String get() = encoded.contentType
    @OptIn(ExperimentalEncodingApi::class)
    val bytes: ByteArray by lazy(LazyThreadSafetyMode.PUBLICATION) {
        gunzip(Base64.Default.decode(encoded.b64Gzip))
    }
    override fun equals(other: Any?): Boolean =
        other is BundleEntry && other.contentType == contentType && other.bytes.contentEquals(bytes)
    override fun hashCode(): Int = 31 * contentType.hashCode() + bytes.contentHashCode()
}
```

**`ArgusUiBundle.kt`** (commonMain):
```kotlin
package com.lynxal.argus.webui

object ArgusUiBundle {
    val files: Map<String, BundleEntry> =
        EncodedBundle.entries.mapValues { (_, enc) -> BundleEntry(enc) }

    fun get(path: String): BundleEntry? =
        files[path] ?: if (path.endsWith("/") || !path.contains('.')) files["/index.html"] else null
}
```

**`Gzip.kt`** (commonMain):
```kotlin
internal expect fun gunzip(bytes: ByteArray): ByteArray
```

**`Gzip.jvmAndAndroid.kt`** (jvmAndAndroidMain):
```kotlin
internal actual fun gunzip(bytes: ByteArray): ByteArray =
    java.util.zip.GZIPInputStream(bytes.inputStream()).use { it.readBytes() }
```

**`Gzip.ios.kt`** (iosMain): parse the gzip envelope manually — validate magic `0x1f 0x8b` + method `0x08`, skip the 10-byte fixed header plus any `FEXTRA`/`FNAME`/`FCOMMENT`/`FHCRC` variable fields, read the 4-byte little-endian `ISIZE` from the trailer, allocate an output buffer, feed the middle (raw deflate) to Apple's `compression_decode_buffer` with `COMPRESSION_ZLIB`. (Apple's `COMPRESSION_ZLIB` means raw deflate despite the name — that's what's inside a gzip envelope.) Fallback plan B if empirical iOS testing contradicts this: vend a tiny pure-Kotlin inflater (~400 LOC) in-tree.

---

## Task 6: Tests (commonTest)

**`ArgusUiBundleTest.kt`:**
- `get_returnsBundleForIndexHtml` — `get("/index.html")` is non-null, correct content-type, non-empty bytes.
- `get_trailingSlashFallsBackToIndex` — `get("/")`, `get("/settings/")` both return the index entry.
- `get_extensionlessPathFallsBackToIndex` — `get("/foo")`, `get("/inspector")` return the index entry.
- `get_missingAssetReturnsNull` — `get("/missing.png")` returns null (has extension, not in map).
- `bytes_isStableAcrossCalls` — two accesses to `.bytes` return `contentEquals`-true arrays (`LazyThreadSafetyMode.PUBLICATION` permits duplicate computation on races, so identity isn't guaranteed).
- `files_isNonEmpty` — guards against a silently empty generator.

**`ContentTypeTest.kt`:** iterate `bundle.files` and assert extension → content-type mapping for each branch (at least one `.html`, one `.js`, one `.css`, one `.woff2`; skip branches not represented in the real dist).

No separate test-only fixture dist — tests run against the real generated bundle. `jvmTest` picks up `generateBundle` transitively via the commonMain srcDir wiring.

---

## Critical files to modify or create

**Modified:**
- `settings.gradle.kts` — add two `include(...)` lines.

**Created:**
- `argus-webui/build.gradle.kts`
- `argus-webui-bundle/build.gradle.kts`
- `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/ArgusUiBundle.kt`
- `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/BundleEntry.kt`
- `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/Gzip.kt`
- `argus-webui-bundle/src/jvmAndAndroidMain/kotlin/com/lynxal/argus/webui/Gzip.jvmAndAndroid.kt`
- `argus-webui-bundle/src/iosMain/kotlin/com/lynxal/argus/webui/Gzip.ios.kt`
- `argus-webui-bundle/src/commonTest/kotlin/com/lynxal/argus/webui/ArgusUiBundleTest.kt`
- `argus-webui-bundle/src/commonTest/kotlin/com/lynxal/argus/webui/ContentTypeTest.kt`

**Generated (not committed, covered by `.gitignore` `build/`):**
- `argus-webui-bundle/build/generated/argus-ui-bundle/commonMain/kotlin/com/lynxal/argus/webui/EncodedBundle.kt`

**Reference files studied (not modified):**
- `argus-core/build.gradle.kts` — the KMP module convention this plan mirrors.
- `gradle/libs.versions.toml` — version catalog consumed via `alias(...)`.
- `gradle.properties` — confirmed `jvm.version=17`, `kotlin.mpp.applyDefaultHierarchyTemplate=true`, `org.gradle.configuration-cache=false`.
- `agent-os/product/tech-stack.md` lines 23 + 78-89 — authoritative module description.
- `agent-os/specs/2026-04-23-2345-argus-webui/shape.md` — the npm producer spec this picks up from.

---

## Verification plan (end-to-end)

Run from repo root after implementation:

1. **npm side works:** `cd argus-webui && npm ci && npm run build` — `dist/index.html` and `dist/assets/*` exist.
2. **Gradle wraps npm:** `./gradlew :argus-webui:npmBuild` — succeeds; second run reports `UP-TO-DATE`.
3. **Generator runs:** `./gradlew :argus-webui-bundle:generateBundle` — produces `argus-webui-bundle/build/generated/argus-ui-bundle/commonMain/kotlin/com/lynxal/argus/webui/EncodedBundle.kt` under 300 KB (acceptance criterion).
4. **Generator is incremental:** second invocation with no changes reports `UP-TO-DATE`.
5. **All KMP targets compile:** `./gradlew :argus-webui-bundle:compileKotlinJvm :argus-webui-bundle:compileKotlinAndroid :argus-webui-bundle:compileKotlinIosArm64 :argus-webui-bundle:compileKotlinIosSimulatorArm64 :argus-webui-bundle:compileKotlinIosX64` — all succeed.
6. **Tests pass on JVM and iOS:** `./gradlew :argus-webui-bundle:jvmTest :argus-webui-bundle:iosSimulatorArm64Test` — both green.
7. **Runtime parity (Android vs iOS):** `ArgusUiBundle.files.keys` has identical contents on both targets.
8. **Manual first-access benchmark (iOS sim):** `measureTimeMillis { ArgusUiBundle.get("/assets/index-<hash>.js")!!.bytes }` — expect <50 ms per-entry first access. Not automated; capture the number once in the implementation commit message.

---

## Open risks / follow-ups

- **iOS gunzip header handling** is the riskiest code. Cross-target test (step 6) catches misbehavior; fallback: vendored pure-Kotlin inflater.
- **`kotlin.io.encoding.Base64`** is `@ExperimentalEncodingApi` in Kotlin 2.2.0. Use call-site `@OptIn` in `BundleEntry.kt` only.
- **Bundle size growth:** current 272 KB dist fits easily under 300 KB `.kt` target. Chunk-join handles arbitrarily large single-file payloads.
- **Future `:argus-server-core`** will consume via `implementation(projects.argusWebuiBundle)` from its `commonMain` and route via `ArgusUiBundle.get(call.request.path())`.
- **Commit hygiene:** per `workflow/commit-conventions` and the user's standing memory — no Co-Authored-By trailers.
