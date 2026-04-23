# `:sample-android` — Shaping Notes

## Scope

A runnable Android application module that exercises Argus' capture side — the Ktor client plugin from `argus-ktor-client-plugin` and the logging delegate from `argus-logging-delegate` — end-to-end against a temporary `ConsoleEventBus` that serializes every `ArgusEvent` to JSON and prints it to logcat + an in-app tail.

No server. No web UI. No mDNS. Those are later prompts that will upgrade this same module in place; this prompt ships only the capture side.

The module also locks in the **debug/release variant seam** (`DebugTools` interface + per-variant `DebugToolsImpl`) that every future Argus consumer app must follow. The seam guarantees the release APK contains **zero** `com.lynxal.argus.*` classes — release code does not `import com.lynxal.argus.anything` and `:argus-core` is only on the classpath via `androidDebug.dependencies { implementation(project(":argus-core")) }`.

## Decisions

- **KMP + Compose Multiplatform**, not pure Android + Views. The user pointed to `../KmmPermissions/:exampleApp` as the pattern; we follow its plugin/catalog/Compose setup. Narrowed to `androidTarget()` only (no iOS target yet) because the spec is Android-only. Adding iOS later is trivial.
- **No `staging` variant** for now. Spec said "staging optional"; keeping the variant matrix at `debug + release` simplifies the seam and can be extended when a real staging build actually needs different Argus wiring.
- **256 KB body cap** (`maxBodyBytes = 262_144L`) on the Argus Ktor plugin install. Smaller than the 1 MB default but larger than any of the four sample GET responses, so nothing truncates in the happy path while still demonstrating the knob.
- **In-app event tail via a bounded `EventLogBuffer`**, not a `logcat -d` shell tail. `ConsoleEventBus` writes to both the buffer and `Log.d`; a `StateFlow<List<String>>` drives the tail. Simpler, no shell process, works identically in release (empty buffer).
- **`DebugTools` interface lives in `androidMain`, not `commonMain`.** It returns a Ktor `HttpClient`, which is KMP but carries variant-specific behavior on Android. Keeping the interface in `androidMain` also keeps the seam visibly Android-scoped.
- **Logger minLevel lowered to Verbose on install.** KMMLogging defaults `Logger.minLevel = LogLevel.Debug`, which would silently drop the VERBOSE button. The sample sets `Logger.minLevel = LogLevel.Verbose` inside `DebugToolsImpl.installLogging()` so all five buttons fire.
- **One-line forward-pointer comments** on `ConsoleEventBus` and `DebugToolsImpl` noting they get replaced by `ArgusServer`'s bus when `:argus-android` lands. Comments flag "this is temporary" only — no multi-line narration.

## Context

- **Visuals:** None.
- **References:**
  - `../KmmPermissions/:exampleApp` — KMP + Compose Multiplatform module layout, plugin aliases, version-catalog usage, Application class wiring, AndroidManifest patterns.
  - `agent-os/specs/2026-04-23-1430-argus-event-model/` — the event schema this sample serializes.
  - `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/` — the plugin being installed.
  - `agent-os/specs/2026-04-23-1800-argus-logging-delegate/` — the logger delegate being registered.
- **Product alignment:**
  - Maps to roadmap Phase 1 validation milestones: "Ktor plugin captures full request/response metadata+bodies" and "KMMLogging delegate captures application logs" — this is the first place both are proven in a live app.
  - Honors `tech-stack.md`'s "debug-only by design; zero Argus code in release builds; no no-op module" constraint via the variant seam.

## Standards Applied

- **`kmp/module-boundaries`** — dependency flows downward only: `:sample-android` → `:argus-core` (debug only). The sample is a consumer at the top of the graph.
- **`kmp/module-build-conventions`** — plugin aliases come from `libs.versions.toml`; root `build.gradle.kts` declares plugins `apply false`; each module uses `libs.plugins.*` at point of use.
- **`naming/package-structure`** — singular folder names (`debug/`, `ui/`), one top-level declaration per file, package root `com.lynxal.argus.sample`.
- **`validation/logging-conventions`** — tag-based calls via `Logger.tag(...)` describing feature area, not class name. Sample uses `Logger.tag("Argus sample")` when emitting the button-triggered log events.
- **`testing/test-structure`** — not directly exercised in this prompt (no unit tests; validation is manual / APK inspection), but the pattern will apply when future prompts add tests around `EventLogBuffer` or the seam.
