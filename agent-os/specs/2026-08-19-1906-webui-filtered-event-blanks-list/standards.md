# Standards — filtered-out event blanks the event list

The following standards apply to this work. Full content reproduced so the spec stands alone.

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
