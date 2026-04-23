# References for Argus Event Model

## Similar implementations

This is the first code landing in the Argus repo. There are no existing Kotlin implementations to mirror. Pattern references come from the agent-os standards (cloud/request-response-modeling, domain-modeling/sealed-hierarchies) and the design handoff.

## Design-side event shape

### `design_handoff_argus_inspector/argus/data.js`

- **Location:** `design_handoff_argus_inspector/argus/data.js`
- **Relevance:** The UI designer's mock event stream — the vocabulary the TS SPA consumer will expect. This spec's `ArgusEvent` model is the authoritative source, but the fixture documents the intent.
- **Key shapes observed:**
  - HTTP event fields: `id`, `kind='HTTP'`, `method`, `status`, `url`, `host`, `ts`, `dur`, `size`, optional `err` for transport failures (e.g., `CONNECT_TIMEOUT`). Maps to our `HttpEvent` → `HttpRequest` + `HttpResponse` + `HttpError`.
  - Log event fields: `id`, `kind='LOG'`, `level` (INFO/DEBUG/WARN/ERROR/VERB), `msg`, `tag`, `ts`. Maps to our `LogEvent`.
  - Custom event fields: `id`, `kind='CUSTOM'`, `name`, `msg`, `ts`. Maps to our `CustomEvent` (with `label` = `name`, `payload` = `msg`, plus Argus-added `direction`, `sourceLabel`, `metadata`).
  - Headers as `[name, value, redacted?]` tuples — matches our `Header(name, value, redacted = false)`.
  - Stack trace string format preserved verbatim in `HttpError.stackTrace` and `ThrowableInfo.stackTrace`.
- **Divergence from fixture:** the fixture uses `kind` as the type tag; Argus wire format uses kotlinx.serialization's default `type` discriminator. Documented in `shape.md`.

## Tech-stack canonical reference

### `agent-os/product/tech-stack.md` §`:argus-core`

- **Location:** `agent-os/product/tech-stack.md` lines 39–47 (§ `Core (KMP) — :argus-core`)
- **Relevance:** The module dependency list and target list for `:argus-core`. This spec realizes that section for the first time; the Gradle scaffolding in Task 2 hews to this list exactly (minus deps reserved for later specs — Ktor client, KMMLogging delegate wiring).
- **Key items:**
  - Kotlin 2.x
  - `kotlinx.coroutines` 1.8+
  - `kotlinx.serialization` JSON
  - `com.lynxal.logging:logging` (KMMLogging) — source of `LogLevel`
  - Ktor client core + plugin API — **deferred** to the client-plugin spec (not used by the event model)
  - Targets: `jvm`, `androidTarget`, `iosArm64`, `iosSimulatorArm64`, `iosX64`

### `agent-os/product/tech-stack.md` §Language & Build

- **Location:** lines 9–16
- **Relevance:** Build conventions the scaffolding must follow — Kotlin 2.x, Gradle Kotlin DSL, version catalog, package root `com.lynxal.argus`, JVM 17 toolchain, Android minSdk 24 (divergence), semver distribution.

## Standards cross-links

All full standards content is inlined in `standards.md`. Short pointers:

- `agent-os/standards/domain-modeling/sealed-hierarchies.md`
- `agent-os/standards/naming/entity-dto-naming.md`
- `agent-os/standards/naming/package-structure.md`
- `agent-os/standards/naming/code-documentation.md`
- `agent-os/standards/kmp/module-build-conventions.md`
- `agent-os/standards/kmp/module-boundaries.md`
- `agent-os/standards/testing/test-structure.md`
- `agent-os/standards/testing/test-data-factories.md`
- `agent-os/standards/validation/no-internal-apis.md`
- `agent-os/standards/cloud/request-response-modeling.md`
