import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.util.Base64
import java.util.zip.GZIPOutputStream

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.vanniktechMavenPublish)
    id("signing")
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
            baseName = "argus-webui-bundle"
            isStatic = useStaticFramework
        }
    }
    jvm()

    applyDefaultHierarchyTemplate()

    sourceSets {
        val commonMain by getting
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }
        val jvmAndAndroidMain by creating { dependsOn(commonMain) }
        getByName("jvmMain").dependsOn(jvmAndAndroidMain)
        getByName("androidMain").dependsOn(jvmAndAndroidMain)
    }

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
    }
}

android {
    namespace = "com.lynxal.argus.webui"
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

abstract class GenerateBundleTask : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val distDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun run() {
        val distRoot = distDir.get().asFile.toPath()
        val outRoot = outputDir.get().dir("com/lynxal/argus/webui").asFile.toPath()
        outRoot.toFile().deleteRecursively()
        Files.createDirectories(outRoot)

        val entries = Files.walk(distRoot).use { stream ->
            stream
                .filter { Files.isRegularFile(it) }
                .map { path ->
                    val key = "/" + distRoot.relativize(path).toString()
                        .replace(File.separatorChar, '/')
                    val raw = Files.readAllBytes(path)
                    val gz = ByteArrayOutputStream().also { baos ->
                        GZIPOutputStream(baos).use { it.write(raw) }
                    }.toByteArray()
                    val b64 = Base64.getEncoder().encodeToString(gz)
                    Triple(key, b64, contentTypeFor(key))
                }
                .sorted { a, b -> a.first.compareTo(b.first) }
                .toList()
        }

        val out = StringBuilder()
        out.appendLine("// GENERATED FILE — DO NOT EDIT")
        out.appendLine("package com.lynxal.argus.webui")
        out.appendLine()
        out.appendLine("internal class EncodedEntry(val contentType: String, val b64Gzip: String)")
        out.appendLine()
        out.appendLine("internal object EncodedBundle {")
        out.appendLine("    val entries: Map<String, EncodedEntry> = mapOf(")
        for ((key, b64, ct) in entries) {
            out.append("        ")
            out.append(quote(key))
            out.appendLine(" to EncodedEntry(")
            out.append("            ")
            out.append(quote(ct))
            out.appendLine(",")
            // JVM class files cap each CONSTANT_Utf8_info at 65 535 bytes;
            // chunk base64 payloads at 60 000 chars and join with + to stay safely under.
            val chunks = b64.chunked(60_000)
            chunks.forEachIndexed { i, chunk ->
                out.append("            ")
                out.append(quote(chunk))
                if (i != chunks.lastIndex) out.appendLine(" +") else out.appendLine()
            }
            out.appendLine("        ),")
        }
        out.appendLine("    )")
        out.appendLine("}")

        Files.writeString(outRoot.resolve("EncodedBundle.kt"), out.toString())
    }

    private fun contentTypeFor(path: String): String {
        val ext = path.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "html" -> "text/html; charset=utf-8"
            "js" -> "application/javascript; charset=utf-8"
            "css" -> "text/css; charset=utf-8"
            "json" -> "application/json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "ico" -> "image/x-icon"
            "woff2" -> "font/woff2"
            else -> "application/octet-stream"
        }
    }

    private fun quote(s: String): String = buildString {
        append('"')
        for (c in s) when (c) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            '$' -> append("\\$")
            else -> append(c)
        }
        append('"')
    }
}

val generateBundle = tasks.register<GenerateBundleTask>("generateBundle") {
    group = "build"
    description = "Generates ArgusUiBundle.kt from argus-webui/dist/."
    distDir.set(project(":argus-webui").layout.projectDirectory.dir("dist"))
    outputDir.set(layout.buildDirectory.dir("generated/argus-ui-bundle/commonMain/kotlin"))
    dependsOn(project(":argus-webui").tasks.named("npmBuild"))
}

kotlin.sourceSets.named("commonMain") {
    kotlin.srcDir(generateBundle.map { it.outputDir })
}

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    coordinates("com.lynxal.argus", "argus-webui-bundle", "0.0.1")
    pom {
        name.set("Argus WebUI Bundle")
        description.set("KMP module that bundles the pre-built Argus web UI as gzipped Base64 byte streams for serving from argus-server-core.")
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
