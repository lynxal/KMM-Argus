import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.vanniktechMavenPublish)
    id("signing")
}

val useStaticFramework = findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true

kotlin {
    val xcf = XCFramework("argus-ios")
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach {
        it.binaries.framework {
            baseName = "argus-ios"
            isStatic = useStaticFramework
            xcf.add(this)
        }
        // Test binaries link directly (no Apple consumer wraps them), so they need
        // -lsqlite3 explicitly. Production frameworks rely on the consumer app's
        // link step to provide libsqlite3.
        it.binaries.getTest("DEBUG").linkerOpts("-lsqlite3")
    }

    applyDefaultHierarchyTemplate()

    sourceSets {
        val iosMain by getting {
            dependencies {
                api(projects.argusCore)
                api(projects.argusServerCore)
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.sqldelight.native.driver)
            }
        }
        val iosTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
            }
        }
    }

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
        freeCompilerArgs.add("-opt-in=kotlin.experimental.ExperimentalNativeApi")
        freeCompilerArgs.add("-opt-in=kotlinx.cinterop.ExperimentalForeignApi")
    }
}

// CI workaround: the embedded Ktor/CIO server started by ArgusSmokeTest emits
// background stdout that has tripped the KGP iOS test reporter on macos-latest
// runners ("Buffer underflow" / "Multiple entries with same key") even though
// the assertions pass. Setting ARGUS_SKIP_IOS_SMOKE=true filters the smoke test
// out at the Gradle task level so the rest of the iosTest source set still runs.
if (System.getenv("ARGUS_SKIP_IOS_SMOKE") == "true") {
    tasks.withType<org.jetbrains.kotlin.gradle.targets.native.tasks.KotlinNativeTest>().configureEach {
        filter.excludeTestsMatching("com.lynxal.argus.ios.ArgusSmokeTest")
    }
}

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    val argusVersion = providers.gradleProperty("argus.version").get()
    val isSnapshot = providers.gradleProperty("argus.localSnapshot").orNull == "true"
    coordinates("com.lynxal.argus", "argus-ios", if (isSnapshot) "$argusVersion-SNAPSHOT" else argusVersion)
    pom {
        name.set("Argus iOS")
        description.set("iOS entry point for Argus debug tooling — consumed via Kotlin Multiplatform from Maven Central, or via the published XCFramework on GitHub Releases (Swift Package Manager). Release builds must contain zero classes from this artifact.")
        url.set("https://github.com/lynxal/argus")
        licenses {
            license {
                name.set("MIT License")
                url.set("https://github.com/lynxal/argus/blob/main/LICENSE")
            }
        }
        issueManagement {
            system.set("GitHub Issues")
            url.set("https://github.com/lynxal/argus/issues")
        }
        developers {
            developer {
                id.set("VardanK")
                name.set("Vardan Kurkchiyan")
                email.set("central.repo@Lynxal.com")
            }
        }
        scm {
            connection.set("scm:git:git://github.com:lynxal/argus.git")
            developerConnection.set("scm:git:ssh://github.com:lynxal/argus.git")
            url.set("https://github.com/lynxal/argus")
        }
    }
}
