# Standards for Argus Phase 2

The following standards apply to this work.

---

## kmp/module-boundaries

# Module Boundaries

## Module Hierarchy (dependencies flow downward only)

```
shared (app layer: screens, use cases, DI, repositories)
├── common_ui (theme, shared UI domain)
│   └── common
├── ui_components / ui_components_v2 (reusable Compose components)
│   ├── common
│   ├── common_ui
│   └── analytics
├── lynxmesh (Bluetooth Mesh protocol: crypto, transport, messages)
│   └── common
├── lynxmesh_sqldelight (SQLDelight database for mesh data)
├── lynxmesh_kable (BLE communication via Kable library)
│   └── common
├── lynxmesh_localstorage (key-value storage abstraction)
├── common (core types, utilities, shared entities)
└── analytics (analytics abstraction)
```

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones.
- **Separate modules for platform-specific adapters** — isolate platform dependencies.
- **`common` has zero internal module dependencies** — it's the foundation.

**Argus mapping:** `:argus-core` is the foundation (analogous to `common`); `:argus-server-core` consumes it; `:argus-android` and (Phase 4) `:argus-ios` are leaf platform adapters. The SQLDelight schema lives in `:argus-core`; the `AndroidSqliteDriver` actual lives in `:argus-android`. No upward dependencies.

---

## kmp/expect-actual-conventions

# Expect/Actual Conventions

## File Naming

- Common declaration: `ClassName.kt` in `commonMain/`
- Platform actuals: `ClassName.android.kt`, `ClassName.ios.kt`

## Which Form to Use

| Form | When |
|------|------|
| `expect class` | Platform-specific constructor params or deps |
| `expect object` | Stateless singleton with platform impl |
| `expect fun` | Standalone function |
| `expect val` | Platform-specific singleton or constant |

## Rules

- Keep expect declarations minimal — push shared logic to commonMain functions that call the expect.
- All expect declarations must have actuals for every supported platform.

**Argus mapping:** `ArgusDatabaseFactory.kt` (expect class in `:argus-core`'s `commonMain/`) + `ArgusDatabaseFactory.android.kt` (actual in `:argus-android`'s `androidMain/`). iOS actual is intentionally deferred to Phase 4.

---

## persistence/sqldelight-conventions

# SQLDelight Conventions

## Schema Files

- One `.sq` file per logical area.
- Generated table classes use **DAO suffix** to distinguish DB entities from domain entities. (Argus exception: a single `event` table backs all `ArgusEvent` subclasses via a serialized `payload TEXT` column — no per-entity DAO suffix needed.)

## Table Structure

- Column names: `snake_case`.
- Complex types: `TEXT AS CustomType` with type adapters.
- Composite primary keys where applicable.
- Index frequently-queried columns.

## Query Naming

- CRUD: `insertEvent`, `getEventsBySession`, `deleteOlderThan`.
- Named parameters: `:sessionId`, `:cutoffMs`.

## Transaction Wrappers (Mandatory)

All DB operations must use transaction utilities for consistent timing and logging.

## Driver Configuration

Platform-specific `SqlDriver` creation via expect/actual.

**Argus mapping:** Schema `argus-core/src/commonMain/sqldelight/com/lynxal/argus/db/Argus.sq`. Android driver in `:argus-android` via `AndroidSqliteDriver`; iOS driver waits for Phase 4.

---

## coroutines/job-lifecycle

# Job Lifecycle

## Cancel Before Restart

Always cancel the previous job before launching a replacement.

## Polling vs Flow Observation

- **Polling loops** (`while(isActive) { delay() }`) for deterministic, recoverable updates.
- **Flow observation** for state/status monitoring; reactive but may fail silently.

## Multiple Independent Jobs

Each recurring task gets its own job variable; cancel each before relaunch.

**Argus mapping:** Retention pruning runs as a flow-observation reaction to `EventStore.append` events past a batching threshold (every 50 inserts), not a polling loop. The pruning job is owned by `EventStore` and cancelled in `EventStore.close()`.

---

## naming/package-structure

# Package Structure

## Folder Naming

Use **singular** names for all packages: `data/`, `entity/`, `useCase/` (camelCase for multi-word).

## File Organization

One top-level class, interface, or enum per file. The file name must match the class name.

**Argus mapping:** New packages added in `:argus-core` — `com.lynxal.argus.correlation`, `com.lynxal.argus.persistence`, `com.lynxal.argus.db`. Each new top-level class lives in its own file.

---

## workflow/commit-conventions

# Commit Conventions

## Format

```
<type>: <subject>

[optional body]
```

### Types

`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`, `build`.

### Rules

- Subject: imperative mood, ≤72 chars, no trailing period.
- Body: explain **why**, not **what**, wrap at 72 chars.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any AI-attributed trailer.

**Argus mapping:** `feat:` for the correlation, persistence, full-body bypass commits; `chore:` for Gradle/SQLDelight plugin scaffolding.
