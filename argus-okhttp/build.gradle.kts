plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.vanniktechMavenPublish)
    id("signing")
}

kotlin {
    jvmToolchain((findProperty("jvm.version") as String).toInt())
    explicitApi()

    compilerOptions {
        freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime")
        freeCompilerArgs.add("-opt-in=kotlin.uuid.ExperimentalUuidApi")
        freeCompilerArgs.add("-opt-in=com.lynxal.argus.capture.InternalArgusApi")
    }
}

dependencies {
    api(projects.argusCore)
    compileOnly(libs.okhttp)

    testImplementation(libs.okhttp)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(kotlin("test"))
}

tasks.withType<Test>().configureEach {
    useJUnit()
}

mavenPublishing {
    publishToMavenCentral()
    signAllPublications()

    val argusVersion = providers.gradleProperty("argus.version").get()
    val isSnapshot = providers.gradleProperty("argus.localSnapshot").orNull == "true"
    coordinates("com.lynxal.argus", "argus-okhttp", if (isSnapshot) "$argusVersion-SNAPSHOT" else argusVersion)
    pom {
        name.set("Argus OkHttp")
        description.set("OkHttp interceptor that publishes HTTP traffic into the shared Argus event bus.")
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
