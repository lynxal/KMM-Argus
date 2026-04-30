plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.vanniktechMavenPublish)
    id("signing")
}

val useStaticFramework = findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true

kotlin {
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach {
        it.binaries.framework {
            baseName = "argus-ios"
            isStatic = useStaticFramework
        }
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

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    coordinates("com.lynxal.argus", "argus-ios", "0.0.1")
    pom {
        name.set("Argus iOS")
        description.set("iOS entry point for Argus debug tooling — wires argus-core + argus-server-core into an iOS app via a debug-only XCFramework. Release builds must contain zero classes from this artifact.")
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
