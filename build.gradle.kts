plugins {
    alias(libs.plugins.androidLibrary).apply(false)
    alias(libs.plugins.androidApplication).apply(false)
    alias(libs.plugins.kotlinMultiplatform).apply(false)
    alias(libs.plugins.kotlinJvm).apply(false)
    alias(libs.plugins.kotlinSerialization).apply(false)
    alias(libs.plugins.composeMultiplatform).apply(false)
    alias(libs.plugins.composeCompiler).apply(false)
    alias(libs.plugins.vanniktechMavenPublish).apply(false)
    alias(libs.plugins.sqldelight).apply(false)
    alias(libs.plugins.buildkonfig).apply(false)
}

// ─── Release version pin gate ───────────────────────────────────────────────
// gradle.properties → argus.version is the single source of truth. Module
// coordinates(…) and the runtime constant (via :argus-core's BuildKonfig block)
// both read it, so they cannot drift. Docs, npm manifests, and the SPM
// release-asset URL cannot read a Gradle property, so they are pinned by hand
// and checked here instead — that is how the tree ended up with four different
// "current versions" before 1.0.0.
val pinnedFiles = listOf(
    "README.md",
    "AGENTS.md",
    "Package.swift",
    "argus-webui/package.json",
    "argus-webui/package-lock.json",
).map { layout.projectDirectory.file(it) }

// Files that legitimately carry a version unrelated to argus.version: the
// sample app, doc tooling, probe scripts, and archived spec records.
val versionSourceTree = fileTree(layout.projectDirectory) {
    include("**/*.kt", "**/*.kts")
    // "build.gradle.kts" is this gate's own source — its guard patterns would
    // match themselves.
    exclude("**/build/**", "**/node_modules/**", "agent-os/**", "sample/**", "build.gradle.kts")
}

tasks.register("verifyVersionPins") {
    group = "verification"
    description = "Fails if a pinned version restatement disagrees with argus.version, " +
        "or if a hardcoded ARGUS_VERSION literal has crept back in."

    val want = providers.gradleProperty("argus.version")
    val files = pinnedFiles
    val sources = versionSourceTree

    doLast {
        val expected = want.get()
        val problems = mutableListOf<String>()
        val byName = files.associateBy { it.asFile.name }

        // Scans one file line by line, reporting every capture that disagrees.
        // Returns the hit count so a regex that has rotted fails loudly instead
        // of passing because it matched nothing.
        fun scan(fileName: String, label: String, regex: Regex, allowSnapshot: Boolean = false): Int {
            val f = byName.getValue(fileName).asFile
            var hits = 0
            f.readLines().forEachIndexed { index, line ->
                regex.findAll(line).forEach { match ->
                    hits++
                    val found = match.groupValues[1]
                    val bare = if (allowSnapshot) found.removeSuffix("-SNAPSHOT") else found
                    if (bare != expected) {
                        problems += "$fileName:${index + 1}  $label: expected '$expected', found '$found'"
                    }
                }
            }
            return hits
        }

        // Maven coordinates in the docs. A -SNAPSHOT suffix is a legitimate
        // local-development pin, so tolerate it on the same base version.
        val coordinate = Regex("""com\.lynxal\.argus:[a-z0-9-]+:(\d+\.\d+\.\d+(?:-SNAPSHOT)?)""")
        val coordinateHits = scan("README.md", "maven coordinate", coordinate, allowSnapshot = true) +
            scan("AGENTS.md", "maven coordinate", coordinate, allowSnapshot = true)
        if (coordinateHits == 0) {
            problems += "README.md/AGENTS.md  no com.lynxal.argus coordinate matched — has the regex rotted?"
        }

        // README §2 Status table:  | Version | `x.y.z` |
        if (scan("README.md", "status table row", Regex("""^\|\s*Version\s*\|\s*`([^`]+)`\s*\|""")) == 0) {
            problems += "README.md  '| Version | `x.y.z` |' status row not found — has the regex rotted?"
        }

        // Package.swift binaryTarget asset URL. Tags carry no `v` prefix.
        val assetUrl = Regex("""releases/download/(\d+\.\d+\.\d+)/argus_ios\.xcframework\.zip""")
        if (scan("Package.swift", "XCFramework asset URL", assetUrl) == 0) {
            problems += "Package.swift  binaryTarget release-asset URL not found — has the regex rotted?"
        }

        // npm manifests are PARSED, not matched: package-lock.json carries a
        // transitive stackback@0.0.2 whose "version" sits at the same indent as
        // the real packages[""] entry, so no regex can tell them apart.
        val slurper = groovy.json.JsonSlurper()

        val webuiPackage = slurper.parse(byName.getValue("package.json").asFile) as Map<*, *>
        if (webuiPackage["version"] != expected) {
            problems += "argus-webui/package.json  \"version\": expected '$expected', found '${webuiPackage["version"]}'"
        }

        val webuiLock = slurper.parse(byName.getValue("package-lock.json").asFile) as Map<*, *>
        if (webuiLock["version"] != expected) {
            problems += "argus-webui/package-lock.json  root \"version\": expected '$expected', found '${webuiLock["version"]}'"
        }
        val lockRootEntry = (webuiLock["packages"] as? Map<*, *>)?.get("") as? Map<*, *>
        if (lockRootEntry == null) {
            problems += "argus-webui/package-lock.json  packages[\"\"] entry missing — did lockfileVersion change?"
        } else if (lockRootEntry["version"] != expected) {
            problems += "argus-webui/package-lock.json  packages[\"\"].version: " +
                "expected '$expected', found '${lockRootEntry["version"]}'"
        }

        // Re-drift guard. The generated ArgusBuildKonfig.kt lives under build/,
        // which is excluded, so any surviving hit is a hand-written literal.
        val hardcodedLiteral = Regex("""ARGUS_VERSION\s*(?::\s*String\s*)?=\s*"""")
        val declaresField = Regex(""""ARGUS_VERSION"""")
        val readsProperty = Regex("""providers\.gradleProperty\("argus\.version"\)""")
        sources.forEach { f ->
            val relative = f.relativeTo(layout.projectDirectory.asFile).path
            f.readLines().forEachIndexed { index, line ->
                if (hardcodedLiteral.containsMatchIn(line)) {
                    problems += "$relative:${index + 1}  hardcoded ARGUS_VERSION literal — " +
                        "read ArgusBuildKonfig.ARGUS_VERSION instead"
                }
                if (declaresField.containsMatchIn(line) && !readsProperty.containsMatchIn(line)) {
                    problems += "$relative:${index + 1}  ARGUS_VERSION field is not wired to " +
                        "providers.gradleProperty(\"argus.version\")"
                }
            }
        }

        if (problems.isNotEmpty()) {
            error(
                buildString {
                    appendLine("Version pins disagree with argus.version=$expected (gradle.properties):")
                    problems.forEach { appendLine("    - $it") }
                    appendLine()
                    appendLine("Fix every file above, or fix argus.version. See the Release section of")
                    appendLine("AGENTS.md — the version Argus reports at runtime is generated from that")
                    appendLine("one property, so it must never be written out by hand.")
                },
            )
        }

        logger.lifecycle("verifyVersionPins: ${files.size} pinned files agree with argus.version=$expected.")
    }
}
