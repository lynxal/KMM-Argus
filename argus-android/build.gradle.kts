plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.vanniktechMavenPublish)
    id("signing")
}

kotlin {
    androidTarget()

    sourceSets {
        androidMain.dependencies {
            api(projects.argusCore)
            api(projects.argusServerCore)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.sqldelight.android.driver)
            // Surface Ktor server logs to Android's logcat so the slf4j NOP warning
            // doesn't silence diagnostic messages (e.g. WebSocket close reasons).
            // slf4j-simple writes to stderr which Android routes to logcat.
            runtimeOnly(libs.slf4j.simple)
        }
        getByName("androidUnitTest").dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.robolectric)
        }
    }

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
        // Argus's live-handle registry uses AtomicReference.compareAndSet. Internal only —
        // it is a private field, so consumers never see it and never opt in themselves.
        freeCompilerArgs.add("-opt-in=kotlin.concurrent.atomics.ExperimentalAtomicApi")
    }
}

android {
    namespace = "com.lynxal.argus.android"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    kotlin {
        jvmToolchain((findProperty("jvm.version") as String).toInt())
    }
}

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    val argusVersion = providers.gradleProperty("argus.version").get()
    val isSnapshot = providers.gradleProperty("argus.localSnapshot").orNull == "true"
    coordinates("com.lynxal.argus", "argus-android", if (isSnapshot) "$argusVersion-SNAPSHOT" else argusVersion)
    pom {
        name.set("Argus Android")
        description.set("Android entry point for Argus debug tooling — wires argus-core + argus-server-core into an Android app via debugImplementation. Release builds must contain zero classes from this artifact.")
        url.set("https://github.com/lynxal/KMM-Argus")
        licenses {
            license {
                name.set("MIT License")
                url.set("https://github.com/lynxal/KMM-Argus/blob/main/LICENSE")
            }
        }
        issueManagement {
            system.set("GitHub Issues")
            url.set("https://github.com/lynxal/KMM-Argus/issues")
        }
        developers {
            developer {
                id.set("VardanK")
                name.set("Vardan Kurkchiyan")
                email.set("central.repo@Lynxal.com")
            }
        }
        scm {
            connection.set("scm:git:git://github.com:lynxal/KMM-Argus.git")
            developerConnection.set("scm:git:ssh://github.com:lynxal/KMM-Argus.git")
            url.set("https://github.com/lynxal/KMM-Argus")
        }
    }
}
