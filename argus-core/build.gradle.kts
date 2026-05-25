plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.vanniktechMavenPublish)
    alias(libs.plugins.sqldelight)
    id("signing")
}

kotlin {
    androidTarget()
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach {
        it.binaries.framework {
            baseName = "argus-core"
        }
    }

    jvm()

    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain {
            dependencies {
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.ktor.client.core)
                implementation(libs.sqldelight.runtime)
                implementation(libs.sqldelight.coroutines.extensions)
                api(libs.lynxal.logging)
            }
        }
        commonTest {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
                implementation(libs.ktor.client.mock)
                implementation(libs.ktor.client.logging)
            }
        }
        getByName("jvmTest").dependencies {
            implementation(libs.sqldelight.sqlite.driver)
        }
        val jvmAndAndroidMain by creating { dependsOn(commonMain.get()) }
        getByName("jvmMain").dependsOn(jvmAndAndroidMain)
        getByName("androidMain").dependsOn(jvmAndAndroidMain)
    }

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }
}

sqldelight {
    databases {
        create("ArgusDatabase") {
            packageName.set("com.lynxal.argus.db")
        }
    }
}

android {
    namespace = "com.lynxal.argus.core"
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

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    val argusVersion = providers.gradleProperty("argus.version").get()
    val isSnapshot = providers.gradleProperty("argus.localSnapshot").orNull == "true"
    coordinates("com.lynxal.argus", "argus-core", if (isSnapshot) "$argusVersion-SNAPSHOT" else argusVersion)
    pom {
        name.set("Argus Core")
        description.set("Shared data model, event bus, and capture APIs for Argus — the in-app debug tooling library for Lynxal Kotlin Multiplatform projects.")
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
