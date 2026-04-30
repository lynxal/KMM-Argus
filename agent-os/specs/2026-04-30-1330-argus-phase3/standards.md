# Standards for Argus Phase 3

The following standards apply to this work.

---

## kmp/module-build-conventions

### Plugin assignment per module

- `serialization` — modules with `@Serializable` data classes (`:argus-core`, `:argus-server-core`).
- `kotlin("jvm")` — pure-JVM modules (Phase 3 introduces `:argus-okhttp` and `:argus-urlconnection` here).
- Maven publishing plugin matches whatever the existing publishable Argus modules use (see `argus-core/build.gradle.kts`).

### Version catalog

All dependency versions in `gradle/libs.versions.toml`. Phase 3 adds:

```toml
[versions]
okhttp = "4.12.0"

[libraries]
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-mockwebserver = { group = "com.squareup.okhttp3", name = "mockwebserver", version.ref = "okhttp" }
```

### JVM toolchain

- `kotlin.jvmToolchain(17)` for both new modules.
- Compiler opt-ins: `kotlin.uuid.ExperimentalUuidApi`, `kotlin.time.ExperimentalTime` where used.

---

## kmp/module-boundaries

### Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones.
- **Separate modules for transport-specific adapters** — Phase 3 isolates OkHttp into `:argus-okhttp`, HttpURLConnection into `:argus-urlconnection`.
- `:argus-core` remains the foundation. Both Phase 3 modules depend down on `:argus-core` only.
- No upward dependencies — `:argus-core` never references `:argus-okhttp` or `:argus-urlconnection`.

### Where the new modules sit

```
:sample-android (debug-only consumes both new modules)
:argus-android
:argus-server-core
:argus-okhttp           ← Phase 3 (kotlin/jvm)
:argus-urlconnection    ← Phase 3 (kotlin/jvm)
:argus-core             ← foundation
```

---

## naming/package-structure

### Folder naming

Singular folder names. Phase 3 adds:

- `com.lynxal.argus.capture` (in `:argus-core/commonMain`) — transport-agnostic body/redaction helpers.
- `com.lynxal.argus.okhttp` (in `:argus-okhttp/main`) — interceptor and config.
- `com.lynxal.argus.urlconnection` (in `:argus-urlconnection/main`) — wrapper, internal subclass, tee streams, config.

### File organisation

One top-level class, interface, or enum per file. File name matches the class name. Already enforced by existing Argus codebase.

---

## naming/class-suffixes

Phase 3 introduces:

- `ArgusOkHttpInterceptor` — `Interceptor` suffix is OkHttp's own; we follow the OkHttp idiom over the standard's `*Service`/`*Repository` since this class is structurally an OkHttp interceptor.
- `ArgusOkHttpConfig`, `ArgusUrlConnectionConfig` — `Config` suffix per existing Argus convention (`ArgusClientConfig`, `ArgusConfig`).
- `ArgusUrlConnection` — public `object` with `wrap(...)` factory; matches the `Argus` plugin / `ArgusServer` naming.
- `ArgusHttpURLConnection` — internal class; mirrors JDK's `HttpURLConnection` for grep-ability.

---

## coroutines/job-lifecycle

### Polling vs reactive

The OkHttp interceptor and HttpURLConnection wrapper are synchronous transports — no long-running jobs to lifecycle-manage. The relevant rule:

- **Sample app's HTTP demo buttons must run on `Dispatchers.IO`**. Both OkHttp's `execute()` and HttpURLConnection's `connect()`/`getInputStream()` are blocking; running on `Dispatchers.Default` or the main thread is incorrect.

---

## workflow/commit-conventions

### Types used in Phase 3

- `feat:` — new modules (`:argus-okhttp`, `:argus-urlconnection`), new public API (`publishCustom`, `engine` field), new WebUI features (engine badges, source-label dropdown), sample-app buttons.
- `refactor:` — capture-helper lift (no behavior change for the Ktor plugin).
- `chore:` — `ARGUS_SCHEMA_VERSION` bump if landed as a separate commit.

### Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body explains **why**, not **what**.
- **No agent attribution** — commits must not include `Co-Authored-By` or any AI-identifying trailer.
- Stage files explicitly by name.
- One topic per commit; do not mix unrelated changes.
