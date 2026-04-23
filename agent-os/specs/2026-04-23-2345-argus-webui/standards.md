# Standards for `:argus-webui`

The following standards apply to this work. The `naming/*` and `testing/test-structure` standards are written against Kotlin; they apply here in spirit — the language differs but the rules (singular folders, one top-level declaration per file, AAA tests, backtick-quality test names) translate directly to TypeScript.

---

## naming/package-structure

# Package Structure

## Folder Naming

Use **singular** names for all packages:

```
data/
  repository/      # not repositories/
  storage/
  converter/
domain/
  entity/
  useCase/         # camelCase for multi-word
  service/
remote/
  service/
ui/
  screen/
  model/
  navigation/
utils/               # exception: plural by Kotlin convention
```

- camelCase for multi-word folders: `useCase/`, `remoteState/`
- No abbreviations in folder names

## Nesting Rule

Create a subdirectory at **domain boundaries**:

```
domain/useCase/
  mesh/                    # subdomain: BLE mesh operations
    state/                 # sub-aspect: state setters
    zoneStateRetrieval/    # sub-aspect: zone queries
      delegate/            # pattern: strategy delegates
  remoteState/             # subdomain: cloud state sync
```

- Each distinct subdomain gets its own folder
- Within a subdomain, further split by aspect if the subdomain grows
- Pattern-specific folders (delegate/, command/) go inside their parent feature

## File Organization

One top-level class, interface, or enum per file. The file name must match the class name.

```
// Good
NodeParameter.kt          → data class NodeParameter(...)
NodeParameterResponse.kt  → data class NodeParameterResponse(...)

// Bad — multiple top-level declarations in one file
NodeParameterResponse.kt  → data class NodeParameterGroupResponse(...)
                            data class NodeParameterResponse(...)
```

Exceptions: private helpers or tightly coupled sealed subtypes defined inside the same sealed parent are fine.

## Root Layer Structure

```
com.lynxal.<module>/
  data/          # Storage, repositories, converters
  domain/        # Entities, use cases, services, business logic
  remote/        # HTTP/WebSocket service interfaces and impls
  ui/            # Screens, screen models, navigation
  di/            # Koin module definitions
  utils/         # Shared utilities
```

- `data/` = local state and orchestration
- `remote/` = network communication (separate from data/)
- `domain/` = pure business logic, no platform dependencies

**Applies here (TS translation):** `src/` layout uses singular, camelCase folders — `store/`, `transport/`, `input/`, `design/`, `styles/`, `components/`, `dev/`. Each component gets its own folder under `components/` named in PascalCase to match its exported factory (`TopBar/`, `EventList/`, `BodyViewer/`). One top-level export per file: `EventList.ts` exports `createEventList`, `Row.ts` exports `createRow`. Exception: `src/transport/schema.ts` groups the small set of wire-contract types (`ArgusEvent`, `HttpEvent`, `LogEvent`, `CustomEvent`, `HelloPayload`, `EventSource`, `Direction`) — consistent with the Kotlin `argus-core/model/` package that groups them and with the prompt's "hand-mirrored schema" requirement.

---

## naming/code-documentation

# Code Documentation

## When to Document

| What | Required | Example |
|------|----------|---------|
| Public/internal API functions | Yes | Repository methods, use case `execute()`, interface methods |
| Non-trivial business logic | Yes | Address resolution, optimistic updates, retry algorithms |
| Classes and interfaces | Yes | KDoc on class declaration explaining purpose and collaborators |
| Simple getters/setters/delegates | No | `fun getCachedNode(id)` that just delegates to storage |
| Private helpers with clear names | No | Unless the logic is surprising |

## Format

Use KDoc (`/** */`) for public API. Use inline comments (`//`) for
non-trivial logic within function bodies.

### Class-level KDoc

```kotlin
/**
 * Orchestrates group-then-retry state retrieval over BLE mesh.
 *
 * Sends a single group command, waits for responses, then retries
 * only missed devices individually — minimizing BLE traffic.
 *
 * @see StateRetrievalDelegate for the per-operation strategy
 */
class GroupStateRetrievalUseCase(...)
```

### Function-level KDoc

```kotlin
/**
 * Refresh light state for all luminaries in the home.
 *
 * Sends a GetAll command to the home group address (0xC0EF).
 * Responses are processed asynchronously by [MeshNetworkStateProcessingDelegate]
 * and stored in [NodeStorage]. This is a blocking call — it waits for
 * all devices to respond or retries to complete.
 */
suspend fun refreshHomeState(): Result<Unit>
```

### Inline comments for business logic

```kotlin
// Element address = node unicast address + channel offset within the node.
// For example, a node at 0x0010 with lightness on channel 1 → address 0x0011.
val address = node.structure.address.toInt() + channelEntry.key
```

## Rules

- Document the **why**, not the **what** — `// Retry missed devices` not
  `// Loop through pending list`
- Include `@see` references to collaborating classes when the interaction
  is not obvious
- For formulas or magic numbers, explain the derivation:
  `// 50ms per device × 1.7 safety factor, clamped to 500–3000ms`
- Add examples in comments when the mapping is non-trivial (e.g., address
  resolution, value range conversions)
- Keep comments up to date — stale comments are worse than no comments
- Do not add comments to code you did not write or change

**Applies here (TS translation):** JSDoc (`/** */`) on every exported factory (`createTopBar`, `createEventList`, …) and on every type in `src/transport/schema.ts`. Inline comments only where **why** is non-obvious — e.g., the keyboard-vs-mouse selection-rail distinction, the 3s/15s heartbeat thresholds, the 10-row overscan count in the virtual list. No narration of what the code does.

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

## What Goes Where

| Module | Contains | Does NOT contain |
|--------|----------|-----------------|
| `common` | Core types, utilities, base entities, `MultiplatformSerializable` | Business logic, UI, platform SDKs |
| `lynxmesh` | Mesh protocol, crypto, transport, message hierarchy | App-level logic, UI, storage |
| `lynxmesh_*` | Isolated platform adapters (SQL, BLE, local storage) | Mesh protocol logic |
| `common_ui` | Theme, colors, shared UI domain entities | Screens, navigation |
| `ui_components` | Reusable Compose components, design system | Business logic, screen-level state |
| `shared` | Screens, use cases, repositories, DI, navigation | Nothing — top-level module |
| `analytics` | Analytics interface and events | Platform SDK implementations (those go in androidMain/iosMain) |

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies (e.g., `lynxmesh_localstorage` keeps `SharedPreferences`/`NSUserDefaults` out of `lynxmesh`)
- **`common` has zero internal module dependencies** — it's the foundation
- **New reusable UI → `ui_components`**; new screens → `shared/ui/screen/`

**Applies here:** `:argus-webui` is a top-of-graph consumer in the Argus dep graph, peer to `:sample-android`. It depends on nothing in the Argus Gradle graph — the wire contract is mirrored by hand in `src/transport/schema.ts` (with a comment pointing at `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`). `:argus-webui-bundle` (later prompt) depends on `:argus-webui`'s `dist/` output but the dependency flows through a build task, not a Gradle `implementation`. The npm side has no Kotlin / Gradle imports, ever.

---

## validation/no-internal-apis

# No Internal API Usage

Never use annotations, classes, or functions from `kotlin.internal.*` or any other internal/unstable API packages. These are implementation details of the Kotlin compiler and standard library — they are not part of the public API, may change or disappear without notice across Kotlin versions, and can cause build failures or runtime errors after upgrades.

## Prohibited Packages

- `kotlin.internal.*` (e.g., `@HidesMembers`, `@LowPriorityInOverloadResolution`, `@OnlyInputTypes`)
- `kotlin.jvm.internal.*`
- `kotlinx.coroutines.internal.*`
- `androidx.compose.runtime.internal.*`
- Any package containing `.internal.` in its path that is not explicitly documented as public API

## Rules

- Do not import from internal packages, even if the IDE autocompletes them
- Do not suppress warnings to allow internal API access (`@Suppress("INVISIBLE_MEMBER", "INVISIBLE_REFERENCE")`)
- If a public API does not exist for the desired behavior, implement it manually or find a supported library alternative
- Treat compiler warnings about internal API usage as errors — fix them immediately

## Common Pitfalls

| Internal API | Use Instead |
|---|---|
| `kotlin.internal.LowPriorityInOverloadResolution` | Rename overloads or use different parameter types |
| `kotlin.internal.HidesMembers` | Use explicit extension function scoping |
| `kotlin.internal.OnlyInputTypes` | Add explicit type checks at call site |
| `kotlin.jvm.internal.Ref` | Use wrapper data classes or `Array(1)` |
| `kotlinx.coroutines.internal.MainDispatcherLoader` | Use `Dispatchers.Main` through public API |

## Why

Internal APIs bypass the Kotlin binary compatibility guarantees. Code that depends on them may:
- Fail to compile after a Kotlin version bump
- Produce incorrect bytecode silently
- Break on specific platforms (especially Kotlin/Native and Kotlin/JS where internals differ)

**Applies here (browser translation):** avoid unstable browser APIs and non-public library exports. No `chrome.*` / `moz*` / vendor-prefixed APIs without a feature check and fallback. No `requestIdleCallback` without guard (Safari only shipped this recently). No Tailwind internals (`tailwindcss/lib/*`) — only documented plugin/config APIs. No `@preact/signals-core` private exports. No `@ts-expect-error` to silence public-API warnings; if a TS type is wrong, file a narrow local shim in `src/types/` and comment the reason.

---

## testing/test-structure

# Test Structure & Naming

## Framework

Use `kotlin.test` for all tests. It's multiplatform-compatible and runs on JVM, Android, and iOS.

```kotlin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.BeforeTest
```

For suspend/coroutine tests, use `kotlinx.coroutines.test.runTest`.

## Test Placement

- **`commonTest`** — default for all tests (runs cross-platform)
- **`androidUnitTest` / `iosTest`** — only for platform-specific implementations (expect/actual, Android Context, iOS frameworks)

Mirror the source package structure in test directories.

## Naming

**Backtick names preferred** for readability:

```kotlin
@Test
fun `encodedId correctly encodes familyId, seriesId, and deviceId`() {
    // ...
}

@Test
fun `node removed from all spaces should become orphaned`() {
    // ...
}
```

Describe the behavior, not the implementation.

## Structure (AAA)

Follow Arrange-Act-Assert:

```kotlin
@Test
fun `K1 derivation matches spec test vector`() {
    // Arrange
    val input = Bytes.fromHexString("3216d1509884b533...")
    val salt = Bytes.fromHexString("2ba14ffa0df84a28...")

    // Act
    val result = CryptoUtils.calculateK1(input, salt)

    // Assert
    assertEquals(expected, result)
}
```

## Setup

Use `@BeforeTest` for shared initialization:

```kotlin
@BeforeTest
fun setup() {
    repository = mock<SomeRepository> { ... }
    useCase = SomeUseCase(repository)
}
```

## Test Class Naming

Suffix with `Test`: `BytesTest`, `IntValidatorTest`, `MeshDeviceDescriptorTest`.

**Applies here (Vitest translation):** tests live at `src/**/__tests__/*.test.ts` mirroring the source tree. `describe('<unitName>', ...)` + `it('behaves like X when Y', ...)` — TypeScript doesn't allow backtick function names but `it` takes an arbitrary string, so the same "backtick-quality" descriptions apply. AAA structure. `beforeEach` for shared setup. Priority coverage in this spec: `applyFilters` (every filter kind + intersections), `buildCurl` (snapshot), `keyboard.ts` dispatcher (skips inside `<input>` except `Escape`), `eventStore` ring-buffer cap at 10 000.

---

## workflow/commit-conventions

# Commit Conventions

## Commit Message Format

```
<type>: <subject> [optional (#issue)]

[optional body]
```

### Types

| Type       | When to use                                    |
|------------|------------------------------------------------|
| `feat`     | New feature or capability                      |
| `fix`      | Bug fix                                        |
| `refactor` | Code restructuring without behavior change     |
| `chore`    | Build, dependency, config, or tooling changes  |
| `docs`     | Documentation only                             |
| `test`     | Adding or updating tests                       |
| `style`    | Formatting, whitespace, import ordering        |
| `perf`     | Performance improvement                        |
| `ci`       | CI/CD pipeline changes                         |
| `build`    | Build system or dependency changes             |

### Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body (optional): explain **why**, not **what**. Wrap at 72 characters.
- Reference GitHub issues when applicable: `(#123)`.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any
  trailer that identifies an AI agent. Commits should be indistinguishable from human-authored
  commits.

### Staging

- Stage files explicitly by name — avoid `git add -A` or `git add .`.
- Never stage secrets (`.env`, credentials, tokens, `google-services.json`).
- Do not mix unrelated changes in a single commit.

### Examples

```
fix: disable controls when device is disconnected (#338)
```

```
refactor: migrate Home screens to koinViewModel for proper scoping

The previous approach leaked ViewModel instances across navigation
destinations because Voyager's navigator-scoped lifecycle was too broad.
```

```
feat: add CCT slider to CanvasControlView (#350)
```

**Applies here:** commits land as `feat(webui): …`, `chore(webui): …`, `docs(webui): …`, etc. Subject ≤ 72 chars, imperative mood, no trailers. No AI attribution (reinforced by the user's `feedback_no_ai_attribution` memory for this repo). One task per commit — task-boundary commits make the task list in `plan.md` a readable history.
