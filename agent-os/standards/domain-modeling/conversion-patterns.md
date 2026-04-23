# Conversion Patterns

## When to Use What

| Approach | When | Example |
|----------|------|--------|
| `Converter` / `BidirectionalConverter` class | Cross-layer transformations (DTO <-> domain) | `SpaceStructureConverter` |
| Companion `from()` factory | Same-layer construction from a related type | `CompositeNodeState.from(nodeStructure)` |
| Extension factory function | Construction from sealed type companions | `MeshDeviceDescriptor.fromDeviceUUID(uuid)` |
| View object extension `to*()` | Data-layer composite → UI view object | `CompositeSpaceState.toRoomItem()` |

## Converter Classes

Place in `data/converter/`. Implement as companion object:

```kotlin
class SpaceStructureConverter {
    companion object : BidirectionalConverter<SpaceStructureResponse, SpaceStructure> {
        override fun convert(input: SpaceStructureResponse): SpaceStructure = ...
        override fun convertBack(input: SpaceStructure): SpaceStructureResponse = ...
    }
}
```

- `Converter<I, R>` — one-way: `convert(input: I): R`
- `BidirectionalConverter<I, R>` — adds `convertBack(input: R): I`
- Use `BidirectionalConverter` when the API requires sending data back

## Companion from() Factories

For constructing a domain object from a related type in the same layer:

```kotlin
data class CompositeNodeState(...) {
    companion object {
        fun from(nodeStructure: NodeStructure): CompositeNodeState = ...
    }
}
```

- Keep in the target class's companion
- Name: `from(source)` — not `of()`, `create()`, or `build()`

## Extension Factory Functions

For factories on sealed type companions:

```kotlin
fun MeshDeviceDescriptor.Companion.fromDeviceUUID(
    deviceUUID: String
): MeshDeviceDescriptor { ... }
```

- Use when the factory logic is complex or lives in a different module
- Keeps the sealed type's companion clean

## DTO Companion Converters

DTOs may implement `Converter` on their companion for self-conversion:

```kotlin
@Serializable
data class MeshNetworkResponse(...) {
    companion object : Converter<MeshNetworkResponse, MeshNetwork> {
        override fun convert(input: MeshNetworkResponse): MeshNetwork = ...
    }
}
```

- Use when the DTO knows exactly how to become the domain type
- Acceptable shortcut for simple 1:1 mappings

## View Object Extension Functions

For converting data-layer composites to UI-layer view objects, use
extension functions on the source type. Place in `utils/NodeUtils.kt`.

```kotlin
// data.storage.space.CompositeSpaceState → UI view object
fun CompositeSpaceState.toRoomItem(): RoomItem =
    RoomItem(
        id = structure.id,
        name = structure.name,
        isTurnedOn = state?.powerState?.isOn ?: false,
        lightness = state?.powerState?.lightness ?: 0f,
        ...
    )

// data.storage.node.CompositeNodeState → V2 UI view object
fun CompositeNodeState.toRoomDeviceInfoV3(): RoomDeviceInfo { ... }

// data.storage.space.CompositeSpaceState → V3 space view object
fun CompositeSpaceState.toSpaceItemV3VO(): SpaceItemV3VO { ... }
```

### Naming convention

- `to<TargetType>()` — standard Kotlin conversion naming
- Append version suffix when multiple UI generations coexist:
  `toRoomDeviceInfo()` (v1), `toRoomDeviceInfoV3()` (v2 package)
- Access `structure.*` for static fields, `state?.*` for dynamic fields
  with safe-call defaults

### Rules

- Extension function on the **source** type, not a standalone utility
- Return the **target** view object directly — no intermediate types
- Use `?: false`, `?: 0f`, `?: emptyList()` defaults for nullable state
- Place all VO extensions in `utils/NodeUtils.kt` for discoverability
- Do not introduce local aliases for `structure`/`state` — use the
  property names directly for readability
