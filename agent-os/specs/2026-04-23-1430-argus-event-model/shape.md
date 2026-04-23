# Argus Event Model — Shaping Notes

## Scope

Define the foundational event schema for Argus in the `:argus-core` KMP module, package `com.lynxal.argus.model`. Ship:

- A `sealed interface ArgusEvent` with three `@Serializable` subclasses (`HttpEvent`, `LogEvent`, `CustomEvent`) and their supporting types (`EventSource`, `Direction`, `HttpRequest`, `HttpResponse`, `HttpError`, `ThrowableInfo`, `Header`).
- An `ArgusEventBus` interface and a `NoopEventBus` default implementation.
- Schema versioning: `const val ARGUS_SCHEMA_VERSION = 1` and a `HelloPayload` DTO that carries it.
- Gradle scaffolding sufficient to build and test `:argus-core` on JVM, Android, and iOS targets.
- Serialization round-trip tests that verify the wire contract on JVM and native.

This is the first code landing in the repo. Everything downstream (Ktor client plugin, logging delegate, server, web UI) depends on this model being stable.

## Decisions

1. **LogLevel source: reuse KMMLogging's enum.** User confirmed — the `logging` artifact from `com.lynxal.logging` is listed as a `:argus-core` dep in `tech-stack.md`, so importing its `LogLevel` keeps the host-app log capture pipeline faithful. If the upstream enum isn't `@Serializable`, add a field-level `KSerializer` mapping to `.name`.

2. **Module scope: scaffold `:argus-core` in this spec.** The repo has zero Kotlin code today. Rather than split scaffolding into a separate prerequisite spec, this spec lands a single self-contained unit: Gradle files + module + model + tests. Later specs inherit a working build.

3. **WS hello: define constant + DTO here, wire later.** The user's acceptance mentions "WS hello payload includes the schema version", but the WS server lives in `:argus-server-core` (doesn't exist yet). This spec defines `ARGUS_SCHEMA_VERSION` and a `HelloPayload` data class in `:argus-core` — both live with the schema they describe. The server spec will import and serve them.

4. **Polymorphic discriminator: default `type` field.** kotlinx.serialization's default polymorphic format (`{"type":"HttpEvent",...}`) is the idiomatic choice. Each subclass carries an explicit `@SerialName` so the wire format is rename-stable. The design fixture (`data.js`) uses `kind` instead of `type`; we're diverging from the fixture's naming on the wire — the TS SPA will read `type`.

5. **Event bus lives with the model.** User's spec explicitly placed `ArgusEventBus` in `com.lynxal.argus.model`. Strictly, services belong in `domain/service/` per `naming/package-structure`, but for v1 the bus is minimal (single `publish` method) and colocating it avoids premature package fragmentation. Out-of-scope to revisit here.

## Context

- **Visuals:** None. This is a pure data-model + Gradle spec.
- **References:**
  - `design_handoff_argus_inspector/argus/data.js` — design-side mock event shapes (`kind`, `level`, `method`, `status`, `url`, `host`, `ts`, `dur`, `size`, `err`, `name`, `msg`, `tag`, header tuples with optional `redacted` flag). We're the authoritative source now; the fixture is informational.
  - `agent-os/product/tech-stack.md` §`:argus-core` — canonical dependency list (kotlinx.coroutines 1.8+, kotlinx.serialization JSON, Ktor client core, `com.lynxal.logging:logging`) and target list (jvm, androidTarget, iosArm64, iosSimulatorArm64, iosX64). This spec realizes that subsection for the first time.
- **Product alignment:** `roadmap.md` Phase 1 MVP. The event model is the first listed deliverable in Phase 1.

## Divergences from synced standards

| Topic | Synced standard | Argus | Why |
|---|---|---|---|
| Android min SDK | 26 (`kmp/module-build-conventions`) | **24** | Debug-only library consumed by third-party Canvas apps — needs broader min SDK reach. Inherits the divergence already documented in `tech-stack.md`. |
| Bus package location | `domain/service/` (`naming/package-structure`) | `com.lynxal.argus.model` | User's explicit location directive; v1 bus is minimal and colocating avoids premature package split. |

## Standards applied

- `domain-modeling/sealed-hierarchies` — sealed interface + `@SerialName`'d data classes
- `naming/entity-dto-naming` — `@Serializable` + `@SerialName`; no `Model` / `Entity` suffixes
- `naming/package-structure` — `com.lynxal.argus.model`; one top-level decl per file (with the `Schema.kt` carve-out for the constant + its DTO)
- `naming/code-documentation` — KDoc on public API; no redundant field comments
- `kmp/module-build-conventions` — plugin assignment, version catalog, JVM 17, iOS static frameworks
- `kmp/module-boundaries` — `:argus-core` is the base of the graph, no internal deps
- `testing/test-structure` — `kotlin.test` in `commonTest`, backticked names, AAA
- `testing/test-data-factories` — `createTest*` factory functions with defaulted parameters
- `validation/no-internal-apis` — no imports from `*.internal.*` packages
- `cloud/request-response-modeling` — cited as the `@Serializable` + `@SerialName` idiom reference, even though Argus events aren't cloud DTOs
