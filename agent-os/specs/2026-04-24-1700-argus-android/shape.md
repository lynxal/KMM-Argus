# `:argus-android` — Shaping Notes

## Scope

Ship the Android-facing facade over `:argus-server-core` so host Android apps can start the embedded inspector with one call. This module:

- Exposes the non-suspending entry point `Argus.start(context, configure): ArgusHandle`.
- Derives `AppInfo` from a Context (`pkg`, `versionName`, `device`, `argusVersion`).
- Owns the server lifecycle on a module-owned `SupervisorJob + Dispatchers.Default` scope; `ArgusHandle.stop()` is explicit.
- Surfaces the bound URL as `StateFlow<String?>` on the handle, and prints it once to logcat on bind.
- Consumes `ArgusServer` + `ArgusEventBus` + `ChannelEventBus` from `:argus-server-core` without redeclaring them.

Consumer-facing API:

```kotlin
val handle = Argus.start(context) {
    maxBodyBytes = 262_144L
}
val client = HttpClient(CIO) {
    install(com.lynxal.argus.ktor.Argus) { eventBus = handle.eventBus }
}
Logger.add(ArgusLoggerDelegate(handle.eventBus))
// … later
handle.stop()
```

The `:sample-android` app is upgraded in place to exercise it: `ConsoleEventBus` and `EventLogBuffer` are deleted, `DebugTools.observeEventLog()` becomes `observeArgusUrl()`, and `SampleScreen` renders the bound URL in a `SelectionContainer`.

## Decisions (captured via AskUserQuestion)

1. **mDNS discovery is dropped from this spec entirely.** `com.lynxal.lantern:lantern-android:0.0.1` is discovery-only per its README ("No service registration — Lantern is discovery-only. Registration is handled by the advertiser side"). Registering via Android's `NsdManager` would satisfy the advertiser side, but the user chose to "skip the discovery for now." The URL is surfaced via logcat + Compose `Text` instead of DNS-SD. The literal-spec acceptance items `dns-sd -B _argus._tcp` and Wi-Fi-drop re-register are removed.

2. **`actual class ArgusServer` stays in `:argus-server-core`.** The literal feature spec says "actual class ArgusServer" is a `:argus-android` deliverable, but server-core already ships that actual in `src/jvmAndAndroidMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`. Moving it would require stripping `androidTarget()` from `:argus-server-core`, which is a larger refactor with no benefit. The facade consumes the existing type.

3. **`ChannelEventBus` is not redeclared here.** It's already in `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/bus/ChannelEventBus.kt` and is wired to `ArgusServer.eventBus` by server-core's actual. `ArgusHandle.eventBus` just delegates.

4. **The sample uses Compose `Text`, not `TextView`.** The literal spec says "add a TextView to the sample MainActivity", but MainActivity is a `ComponentActivity` using `setContent { App(...) }` from Compose Multiplatform. A `TextView` would break the convention. Rendered via `androidx.compose.foundation.text.selection.SelectionContainer` + `Text` so the URL is long-press-copyable.

## Decisions (captured via Plan-agent review)

5. **Scope ownership is module-local, not `ProcessLifecycleOwner`.** `Argus.start()` creates a `CoroutineScope(SupervisorJob() + Dispatchers.Default)`; `ArgusHandle.stop()` cancels it. Keeps the dep surface minimal and matches `ArgusServer`'s own explicit start/stop contract. Consumers that want lifecycle-awareness can observe their own lifecycle and call `handle.stop()`.

6. **`Argus.start()` is non-suspending.** Server-core's `start()` is `suspend` (deliberate — `engine.resolvedConnectors()` is suspend), but host apps call `Argus.start()` from `Application.onCreate()` and can't suspend. The facade launches `server.start()` in the module-owned scope and returns the handle immediately. `handle.eventBus` is already valid on return (`ArgusServer.eventBus` is property-initialised in the constructor); `handle.boundPort` / `handle.url` flip when the server finishes binding. Events published before bind land in the ring buffer and are replayed via `/api/events`.

7. **IP is a one-shot snapshot on bind, not observed.** Enumerate `NetworkInterface.getNetworkInterfaces()` once in `onStarted()`, pick the first non-loopback IPv4 that `isSiteLocalAddress`, call it done. Observing network changes (via `ConnectivityManager.registerDefaultNetworkCallback`) would require lifecycle plumbing for a dev tool — engineers restart the sample after moving networks more readily than they notice a stale URL. The "recover from Wi-Fi drop" acceptance item is dropped along with mDNS.

8. **Bootstrap log line uses `android.util.Log.i`, not `Logger.tag("Argus")`.** `Argus.start()` runs before `installLogging()` wires KMMLogging delegates in the sample's flow (`DebugToolsImpl` constructs the handle, then the `SampleApp` calls `installLogging()`). `Log.i` is infra-side and always available. Single hard-coded line; not an app-level concern.

9. **`ArgusConfigBuilder` lives only in `:argus-android`.** The KMP `ArgusConfig` is a plain data class with sensible defaults and all fields public. Adding a `Builder` to `:argus-server-core` would add ceremony for no KMP gain. The Android facade needs a builder specifically because `appInfo` is auto-derived from `Context` and must not be caller-settable via the DSL.

10. **`argusVersion` stamped via local `BuildConfig.ARGUS_VERSION`.** The repo has no root-level version source of truth today. Stamped as `"0.1.0"` in `argus-android/build.gradle.kts` for this first cut; promoting to a shared constant or a Gradle property is a follow-up if other modules need it.

11. **Name clash (`Argus` facade vs `Argus` Ktor plugin) resolved at the call site.** The facade is `com.lynxal.argus.android.Argus`; the Ktor client plugin in `:argus-core` is `com.lynxal.argus.ktor.Argus`. Both are `public val Argus` / `public object Argus`. The sample uses `import com.lynxal.argus.ktor.Argus as ArgusPlugin` for clarity. Renaming either side is out of scope — the user's literal spec calls the facade `Argus`.

12. **`DebugTools.observeEventLog()` is replaced, not extended, by `observeArgusUrl()`.** The `ConsoleEventBus` / `EventLogBuffer` / `EventTail` chain was explicit scaffolding from the `:sample-android` bootstrap (commit `6bb37f1`). Keeping it alongside the real Argus server would double-publish events and clutter the UI. The whole point of shipping Argus is the web UI — dogfooding happens there.

## Context

- **Visuals:** None supplied. `visuals/` kept empty for folder symmetry with prior specs.
- **References:** See `references.md`. Key files: `argus-server-core/src/jvmAndAndroidMain/.../ArgusServer.kt` (confirms `eventBus` available pre-`start()`), `argus-core/src/commonMain/.../ktor/ArgusClientPlugin.kt` (the name-clash source), `agent-os/specs/2026-04-24-1500-argus-server-core/` (immediate-predecessor spec; folder layout precedent).
- **Product alignment:** Phase 1 of `agent-os/product/roadmap.md`. The module is named in the product mission (`agent-os/product/mission.md` line 29) as the Android host wiring for discovery; in this spec the discovery half is deferred.

## Open risks / follow-ups

- **mDNS deferred, not abandoned.** A follow-up spec can add registration via `NsdManager` (reliable for the advertiser side) or wait for a `LanternAdvertiser` in the lantern_android repo.
- **Startup URL is stale after Wi-Fi change.** Acceptable for a dev tool; engineers restart. If it becomes annoying, observe network changes on a `callbackFlow` from `ConnectivityManager` in a follow-up.
- **`argusVersion` diverges from real module version.** Bump by hand on release-branch cuts until a repo-root version source of truth exists.
- **Release variant of the sample** must stay argus-free. Grep gate in the verification plan catches regressions; CI should eventually apkanalyze the release dex.
- **Commit hygiene:** `feat:` prefix, imperative, ≤72 chars, no `Co-Authored-By` trailer (per `MEMORY.md` and `workflow/commit-conventions`).

## Standards Applied

- `kmp/module-boundaries` — one-way deps on `:argus-server-core` + `:argus-core`.
- `kmp/module-build-conventions` — version catalog, KTS, JVM 17, `androidTarget()`-only KMP lib.
- `naming/package-structure` — `com.lynxal.argus.android`; one top-level per file.
- `platform/init-and-di` — `Application.onCreate()` auto-init (sample already follows).
- `validation/logging-conventions` — KMMLogging for app code; `Log.i` for the one bootstrap line.
- `workflow/commit-conventions` — `feat:` prefix, no AI attribution.
