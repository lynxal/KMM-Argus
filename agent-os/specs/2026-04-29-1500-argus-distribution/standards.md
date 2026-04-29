# Standards for Argus Distribution

The following standards apply to this work.

---

## kmp/module-build-conventions

> Source: `agent-os/standards/kmp/module-build-conventions.md`

Key rules applied here:

- All dependency versions live in `gradle/libs.versions.toml`. Root `build.gradle.kts` declares plugins with `apply false`. Modules access via `libs.plugins.X`.
- All modules apply: `compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }`.
- iOS framework configuration uses `findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true` toggle. Default static; `-PuseStaticFramework=false` to disable.
- `jvm.version` = 17 toolchain. `android.compileSdk` from libs catalog.

Plugin assignment per module — for this spec:
- `com.vanniktech.maven.publish` + `signing` — every published library module (`argus-core`, `argus-server-core`, `argus-webui-bundle`, `argus-android`).
- Not applied to `:sample-android` (consumer reference, not published).
- Not applied to `:argus-webui` (npm-only module that produces artifacts consumed by `:argus-webui-bundle`).

---

## validation/no-internal-apis

> Source: `agent-os/standards/validation/no-internal-apis.md`

Key rules:

- Never import from `kotlin.internal.*`, `kotlinx.coroutines.internal.*`, `androidx.compose.runtime.internal.*`, or any `.internal.` path that is not documented public API.
- Do not suppress `INVISIBLE_MEMBER` / `INVISIBLE_REFERENCE` warnings.
- Treat compiler warnings about internal API usage as errors.

Why it matters here: published artifacts cross the binary-compatibility boundary. Internal API usage in any of the four published modules can break consumers across Kotlin upgrades.

---

## workflow/commit-conventions

> Source: `agent-os/standards/workflow/commit-conventions.md`

Format: `<type>: <subject>` — imperative, max 72 chars, no trailing period.

Types relevant to this spec:
- `build` — `gradle.properties`, `libs.versions.toml`, `mavenPublishing {}` blocks.
- `ci` — `.github/workflows/*.yml`.
- `feat` — public-facing distribution capability (e.g., the dex verifier task, README adoption guide).
- `chore` — spec docs.

**No agent attribution.** Commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any AI trailer.

Stage by name, never `git add -A`. Never stage secrets.

---

## kmp/build-variants (informational)

> Source: `agent-os/standards/kmp/build-variants.md`

Argus does not use buildkonfig flavors today. The seam pattern in `:sample-android` is buildType-driven (`debug` / `release`), not flavor-driven. Consumers may layer their own flavors on top — `stagingImplementation` works the same way as `debugImplementation` if a `staging` buildType is declared.
