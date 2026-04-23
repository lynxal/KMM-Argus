# Converter Conventions

Converters map between layers: DB/API DTOs <-> domain entities.

## Interfaces

- `Converter<I, R>` — one-way (`convert(input: I): R`)
- `BidirectionalConverter<I, R>` — adds `convertBack(input: R): I`

Use `BidirectionalConverter` when data flows both directions (e.g., saving + loading).

## Stateless vs Context-Aware

**Stateless** — use companion object:
```kotlin
class NodeChannelConverter {
    companion object : BidirectionalConverter<ChannelResponse, NodeChannel> {
        override fun convert(input: ChannelResponse) = NodeChannel(
            capability = ChannelCapability.fromId(input.capability),
            ...
        )
        override fun convertBack(input: NodeChannel) = ChannelResponse(
            capability = input.capability.id,
            ...
        )
    }
}
```

**Context-aware** — use class instance with constructor params:
```kotlin
class NetKeyConverter(private val meshUuid: String) :
    BidirectionalConverter<NetworkKeyDAO, NetworkKey> {
    override fun convert(input: NetworkKeyDAO) = NetworkKey(
        meshUuid = meshUuid, ...
    )
}
```

## Enum Serialization

- Store enum as `.id` (Int) in DB/API
- Reconstruct via factory method: `EnumType.fromId(value)`
- Never use enum constructor directly from external data

## Null Fallbacks

API fields are often nullable. Always provide safe defaults:
```kotlin
// Good
illustrationId = input.illustrationId ?: "default"
deviceIds = input.deviceIds?.toSet() ?: emptySet()
name = input.name ?: "Canvas Hub"

// Bad — will crash on null API response
illustrationId = input.illustrationId!!
```
