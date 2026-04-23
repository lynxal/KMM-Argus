# State Composition

## Structure + State Separation

Split entities with both static config and dynamic values into two classes:

```kotlin
// Static configuration (rarely changes)
data class NodeStructure(
    val id: Long?,
    val uuid: String,
    val name: String,
    val address: UInt,
    val capabilities: Set<ChannelCapability>,
    val channels: Map<Int, ChannelCapability>
)

// Dynamic runtime state (changes frequently)
data class NodeState(
    val id: Long?,
    val uuid: String,
    val channelPowerStates: Map<Int, PowerStateV3>,
    val automationState: AutomationState,
    val connected: Boolean? = null
)
```

## Composite Wrapper

Combine structure and state in a Composite wrapper:

```kotlin
data class CompositeNodeState(
    val structure: NodeStructure,
    val state: NodeState?
)
```

- `state` is nullable — structure may exist before state is known
- This pattern applies to **Spaces** and **Nodes**
- Derived properties use `by lazy { }`

## Deprecated Patterns

- **`Combined*` classes** — deprecated, do not use
- **Flattened `Composite*` classes** (all fields in one class) — deprecated
- New code must use the `structure` + `state` wrapper form

## State Merging (intersect)

Merge state from multiple sources using timestamp precedence:

```kotlin
fun intersect(other: PowerStateV3?): PowerStateV3 {
    // Most recent timestamp wins
    // Nullable fields fall back to the other source
    return this.copy(
        isOn = isOn ?: other.isOn,
        lightness = lightness ?: other.lightness
    )
}
```

- Most recent `dateUpdated` takes precedence
- Null fields fall back to the other source via `?:`
- Used for merging Remote + Mesh state

## Collection Extensions

Use extension functions for hierarchical navigation:

```kotlin
fun Collection<CompositeSpaceState>.resolveRootSpace(
    space: CompositeSpaceState
): CompositeSpaceState? {
    return space.structure.parentId?.let { id ->
        find { it.structure.id == id }
    }
}
```
