# Argus

In-app debug tooling for Lynxal Kotlin Multiplatform apps. Argus runs an embedded HTTP/WebSocket server inside debug builds and exposes a web UI on the local network for capturing logs, network traffic, and app events.

## Modules

| Artifact | Coordinates |
|---|---|
| Shared model + capture APIs | `com.lynxal.argus:argus-core:0.0.1` |
| Embedded Ktor server (REST + WebSocket) | `com.lynxal.argus:argus-server-core:0.0.1` |
| Pre-built web UI bundle | `com.lynxal.argus:argus-webui-bundle:0.0.1` |
| Android entry point | `com.lynxal.argus:argus-android:0.0.1` |

## Distribution model

Argus ships **only to debug** (and optionally staging) classpaths. Release builds **must contain zero Argus classes**. There is no no-op module by design.

The pattern: a consumer-side interface seam in `src/main/`, debug and release source-set splits supplying per-variant implementations, and a Gradle dexdump verifier that fails CI if any `com.lynxal.argus.*` class leaks into the release APK.

## Consumer setup

```kotlin
// build.gradle.kts (Android app)
dependencies {
    debugImplementation("com.lynxal.argus:argus-android:0.0.1")
    // NEVER implementation or releaseImplementation — both leak Argus into the release APK.
}
```

Define a debug-tools interface in `src/main/` (no Argus imports):

```kotlin
interface DebugTools {
    fun buildHttpClient(): HttpClient
    fun installLogging()
    fun observeArgusUrl(): StateFlow<String?>
}
```

Provide a debug impl in `src/debug/` that wires Argus, and a release impl in `src/release/` that is a no-op and **does not import `com.lynxal.argus.*`**. Application code calls only through the interface.

See [`:sample-android`](./sample-android) for the canonical reference:

- `src/androidMain/.../debug/DebugTools.kt` — interface
- `src/androidDebug/.../debug/DebugToolsImpl.kt` — installs Argus + Ktor server
- `src/androidRelease/.../debug/DebugToolsImpl.kt` — no Argus imports

## CI gate

`./gradlew :sample-android:verifyReleaseHasNoArgus` assembles the release APK and dumps every dex class. The build fails if any of these prefixes appear:

- `com/lynxal/argus/`
- `io/ktor/server/`

This task is wired into `check` and runs on every PR via [`verifyRelease.yml`](./.github/workflows/verifyRelease.yml).

## Publishing

Releases are cut by tagging on GitHub. The [`publishToMavenCentral`](./.github/workflows/publishToMavenCentral.yml) workflow runs on `release: [released]` and publishes all four artifacts via the `com.vanniktech.maven.publish` plugin.
