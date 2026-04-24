plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.androidLibrary)
}

val useStaticFramework = findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true

kotlin {
    androidTarget()
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach {
        it.binaries.framework {
            baseName = "argus-server-core"
            isStatic = useStaticFramework
        }
    }
    jvm()

    applyDefaultHierarchyTemplate()

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(projects.argusCore)
                implementation(projects.argusWebuiBundle)
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.ktor.server.core)
                implementation(libs.ktor.server.cio)
                implementation(libs.ktor.server.websockets)
                implementation(libs.ktor.server.content.negotiation)
                implementation(libs.ktor.server.cors)
                implementation(libs.ktor.serialization.kotlinx.json)
            }
        }
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
            }
        }
        val jvmAndAndroidMain by creating { dependsOn(commonMain) }
        getByName("jvmMain").dependsOn(jvmAndAndroidMain)
        getByName("androidMain").dependsOn(jvmAndAndroidMain)

        val jvmTest by getting {
            dependencies {
                implementation(libs.ktor.server.test.host)
                implementation(libs.ktor.client.core)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.client.websockets)
                implementation(libs.kotlinx.coroutines.test)
            }
        }
    }

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }
}

android {
    namespace = "com.lynxal.argus.server"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain((findProperty("jvm.version") as String).toInt())
    }
}
