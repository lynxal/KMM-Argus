import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.STRING
import org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask
import org.gradle.jvm.tasks.Jar as JvmJar

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.vanniktechMavenPublish)
    alias(libs.plugins.sqldelight)
    alias(libs.plugins.buildkonfig)
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

// ─── Generated library version ───────────────────────────────────────────────
// The version Argus reports at runtime is stamped from gradle.properties →
// argus.version, the same property every module's coordinates(…) reads. Exposed
// as a public object so :argus-android and :argus-ios can read it; BuildKonfig
// generates an internal one by default. Never hardcode the version —
// :verifyVersionPins fails the build if a literal reappears.
val generateBuildKonfigTask = tasks.named("generateBuildKonfig")

buildkonfig {
    packageName = "com.lynxal.argus.model"
    exposeObjectWithName = "ArgusBuildKonfig"

    defaultConfigs {
        buildConfigField(STRING, "ARGUS_VERSION", providers.gradleProperty("argus.version").get())
    }
}

// BuildKonfig adds its output as a commonMain srcDir but declares no task
// dependency anywhere — it relies on Gradle inferring one from the Provider it
// passes to srcDir, which does not happen here. The generated file therefore
// resolves only if generateBuildKonfig happened to have run before, so a clean
// build fails with "Unresolved reference 'ArgusBuildKonfig'" in :argus-android
// and :argus-ios. Declare the dependency explicitly, for every compile task type
// (JVM, Android variants, and Native all implement KotlinCompilationTask) plus
// the per-target sourcesJar tasks the publish uses.
tasks.withType<KotlinCompilationTask<*>>().configureEach { dependsOn(generateBuildKonfigTask) }
tasks.withType<JvmJar>().configureEach { dependsOn(generateBuildKonfigTask) }

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    val argusVersion = providers.gradleProperty("argus.version").get()
    val isSnapshot = providers.gradleProperty("argus.localSnapshot").orNull == "true"
    coordinates("com.lynxal.argus", "argus-core", if (isSnapshot) "$argusVersion-SNAPSHOT" else argusVersion)
    pom {
        name.set("Argus Core")
        description.set("Shared data model, event bus, and capture APIs for Argus — the in-app debug tooling library for Lynxal Kotlin Multiplatform projects.")
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
