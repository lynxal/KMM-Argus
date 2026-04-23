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
