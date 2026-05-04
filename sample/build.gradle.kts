import java.io.File
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
}

// iOS-side argus toggle — driven by the Xcode build-phase script based on
// $CONFIGURATION. Mirrors the Android debug/release source-set seam. Defaults
// to false so plain `./gradlew build` produces the release-clean iOS framework.
val argusEnabled: Boolean =
    (findProperty("argusEnabled") as? String)?.toBoolean() ?: false

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach {
        it.binaries.framework {
            baseName = "Sample"
            isStatic = true
        }
    }

    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.lynxal.logging)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.cio)
            implementation(libs.androidx.activity.compose)
            implementation(libs.androidx.lifecycle.viewmodel)
            implementation(libs.androidx.lifecycle.runtime.compose)
        }
        val iosMain by getting {
            kotlin.srcDir(
                if (argusEnabled) "src/iosArgusEnabledMain/kotlin"
                else "src/iosArgusDisabledMain/kotlin"
            )
            dependencies {
                implementation(libs.ktor.client.darwin)
                if (argusEnabled) {
                    implementation(projects.argusIos)
                }
            }
        }
    }

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
    }
}

android {
    namespace = "com.lynxal.argus.sample"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.lynxal.argus.sample"
        // Sample app runs on 34+ to sidestep a D8 DEX-v40 identifier issue in Ktor 3.2.x
        // (SimpleName with spaces from context parameters). The distributed :argus-core
        // library still supports minSdk 24 — this divergence is harness-only.
        minSdk = 34
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.0.1"
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    kotlin {
        jvmToolchain((findProperty("jvm.version") as String).toInt())
    }
}

dependencies {
    debugImplementation(compose.uiTooling)
    debugImplementation(projects.argusAndroid)
    debugImplementation(projects.argusOkhttp)
    debugImplementation(projects.argusUrlconnection)
    debugImplementation(libs.okhttp)
}

// ─── Android release gate ───────────────────────────────────────────────────
// Forbidden dex-internal class prefixes in the release APK. If any of these
// appear in classes*.dex, the release variant is leaking debug-only code.
// "Lcom/lynxal/argus/" catches every Argus library subpackage; the sample
// app's own classes also live under that root, so they're allowed via the
// sample-namespace exclusion below.
val forbiddenReleaseDexPrefixes = listOf(
    "Lcom/lynxal/argus/",
    "Lio/ktor/server/",
)
val allowedReleaseDexPrefixes = listOf(
    "Lcom/lynxal/argus/sample/",
)

val verifyReleaseHasNoArgus = tasks.register("verifyReleaseHasNoArgus") {
    group = "verification"
    description = "Fails if the release APK contains any com.lynxal.argus.* or Ktor server classes."
    dependsOn("assembleRelease")

    doLast {
        val apkDir = layout.buildDirectory.dir("outputs/apk/release").get().asFile
        val apk = apkDir.listFiles { f -> f.extension == "apk" }?.firstOrNull()
            ?: error("No release APK found under $apkDir - did assembleRelease run?")

        val sdkRoot = android.sdkDirectory.absolutePath
        val buildToolsRoot = File(sdkRoot, "build-tools")
        val buildTools = buildToolsRoot.listFiles { f -> f.isDirectory }
            ?.maxByOrNull { it.name }
            ?: error("No Android build-tools found under $buildToolsRoot")
        val dexdumpFile = File(buildTools, "dexdump")
        check(dexdumpFile.exists()) { "dexdump not found at ${dexdumpFile.absolutePath}" }

        val process = ProcessBuilder(dexdumpFile.absolutePath, apk.absolutePath)
            .redirectErrorStream(true)
            .start()
        val dump = process.inputStream.bufferedReader().readText()
        val exit = process.waitFor()
        check(exit == 0) { "dexdump exited with $exit on ${apk.name}\n$dump" }

        val offenders = forbiddenReleaseDexPrefixes.flatMap { prefix ->
            // dexdump emits e.g. `Class descriptor  : 'Lcom/lynxal/argus/Foo;'`
            Regex("""'(${Regex.escape(prefix)}[^']+)'""")
                .findAll(dump)
                .map { it.groupValues[1] }
                .toList()
        }.distinct().filterNot { descriptor ->
            allowedReleaseDexPrefixes.any { descriptor.startsWith(it) }
        }

        if (offenders.isNotEmpty()) {
            val msg = buildString {
                appendLine("Release APK contains forbidden classes:")
                appendLine("  apk: ${apk.absolutePath}")
                offenders.take(50).forEach { appendLine("    - $it") }
                if (offenders.size > 50) appendLine("    ... and ${offenders.size - 50} more")
                appendLine()
                appendLine("Consumers must consume Argus only via debugImplementation.")
                appendLine("Release source sets must not import com.lynxal.argus.* - see")
                appendLine("src/androidRelease/.../DebugToolsImpl.kt for the seam contract.")
            }
            throw GradleException(msg)
        }

        logger.lifecycle("verifyReleaseHasNoArgus: ${apk.name} is clean (0 forbidden classes).")
    }
}

// ─── iOS release gate ───────────────────────────────────────────────────────
// Forbidden symbol tokens in the Release iOS framework binary. If any appear
// in the produced Sample.framework binary, the iOS release variant is leaking
// debug-only Argus / Ktor-server code.
val forbiddenReleaseSymbolTokens = listOf(
    "kfun:com.lynxal.argus.",
    "_kclass:com.lynxal.argus.",
    "kfun:io.ktor.server.",
    "_kclass:io.ktor.server.",
    "ArgusServer",
    "ArgusEventBus",
)
val allowedReleaseSymbolPrefixes = listOf(
    "com.lynxal.argus.sample.", // class members and subpackages
    "com.lynxal.argus.sample#",  // top-level functions
)

val verifyIosReleaseHasNoArgus = tasks.register("verifyIosReleaseHasNoArgus") {
    group = "verification"
    description = "Fails if the Release Sample.framework contains any com.lynxal.argus.* or Ktor server symbols."

    doLast {
        val projectFile = layout.projectDirectory.dir("iosApp/iosApp.xcodeproj").asFile
        val derivedData = layout.buildDirectory.dir("xcode").get().asFile
        derivedData.mkdirs()

        // Build for iOS Simulator so this works without a code-signing identity (CI-friendly).
        val xcodebuild = ProcessBuilder(
            "xcodebuild",
            "-project", projectFile.absolutePath,
            "-scheme", "iosApp",
            "-configuration", "Release",
            "-destination", "generic/platform=iOS Simulator",
            "-derivedDataPath", derivedData.absolutePath,
            "CODE_SIGNING_ALLOWED=NO",
            "CODE_SIGNING_REQUIRED=NO",
            "OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED=NO",
            "build",
        ).redirectErrorStream(true).start()

        val xcodeLog = xcodebuild.inputStream.bufferedReader().readText()
        val exit = xcodebuild.waitFor()
        check(exit == 0) { "xcodebuild Release exited with $exit\n$xcodeLog" }

        // Xcode's framework output path varies with the destination/SDK
        // (`Build/Products/Sample.framework/Sample` on some setups,
        // `Build/Products/Release-iphonesimulator/Sample.framework/Sample` on
        // CI's Xcode 16.4), so resolve it by walking Build/Products instead of
        // hardcoding a single layout. Prefer the standalone framework over an
        // embedded copy nested inside an .app bundle.
        val productsDir = File(derivedData, "Build/Products")
        val candidates = productsDir.walkTopDown()
            .filter { it.isFile && it.name == "Sample" && it.parentFile?.name == "Sample.framework" }
            .toList()
        val framework = candidates.firstOrNull { f -> f.absolutePath.split('/').none { it.endsWith(".app") } }
            ?: candidates.firstOrNull()
        check(framework != null && framework.exists()) {
            "Sample framework binary not found under ${productsDir.absolutePath}\n$xcodeLog"
        }

        val stringsProcess = ProcessBuilder("strings", framework.absolutePath)
            .redirectErrorStream(true).start()
        val stringsOutput = stringsProcess.inputStream.bufferedReader().readText()
        check(stringsProcess.waitFor() == 0) { "strings exited non-zero on ${framework.name}" }

        val offenders = mutableSetOf<String>()
        stringsOutput.lineSequence().forEach { line ->
            val matched = forbiddenReleaseSymbolTokens.any { line.contains(it) }
            if (!matched) return@forEach
            val whitelisted = allowedReleaseSymbolPrefixes.any { line.contains(it) }
            if (!whitelisted) offenders += line.trim()
        }

        if (offenders.isNotEmpty()) {
            val msg = buildString {
                appendLine("Release Sample.framework contains forbidden symbols:")
                appendLine("  framework: ${framework.absolutePath}")
                offenders.take(50).forEach { appendLine("    - $it") }
                if (offenders.size > 50) appendLine("    ... and ${offenders.size - 50} more")
                appendLine()
                appendLine("Consumers must consume Argus only via the iosArgusEnabledMain seam (Debug only).")
                appendLine("The release variant must not link :argus-ios — see")
                appendLine("src/iosArgusDisabledMain/.../DebugToolsImpl.kt for the seam contract.")
            }
            throw GradleException(msg)
        }

        logger.lifecycle("verifyIosReleaseHasNoArgus: ${framework.name} is clean (0 forbidden symbols).")
    }
}

tasks.named("check") {
    dependsOn(verifyReleaseHasNoArgus)
    dependsOn(verifyIosReleaseHasNoArgus)
}
