# Entity & DTO Naming

## Domain Entities

Plain descriptive names — no prefix or suffix:

```kotlin
data class UserProfile(...)
data class SpaceData(...)
data class SceneData(...)
```

- `Data` suffix for aggregate domain objects: `SpaceData`, `SceneData`
- No `Entity` or `Model` suffix

## State Objects

Source-based prefixes indicate where the data comes from:

| Prefix | Meaning | Example |
|--------|---------|--------|
| `Remote` | Raw cloud/API state | `RemoteNodeState`, `RemoteZoneState` |
| `Mesh` | Raw BLE mesh state | `MeshNodeState`, `MeshZoneState` |
| `Composite` | Wrapper with `structure` + `state` fields | `CompositeNodeState`, `CompositeSpaceState` |

- **`Combined*` is deprecated** — do not use
- **Flattened `Composite*` is deprecated** — only use the `structure` + `state` wrapper form
- See `domain-modeling/state-composition` for the Composite wrapper pattern
- State suffix always present: `*State`

## Sealed State Hierarchies

For operation outcomes, use sealed interfaces:

```kotlin
sealed interface HttpResponseState {
    data object Success : HttpResponseState
    data class ServerError(val message: String) : HttpResponseState
    data class ClientError(val message: String) : HttpResponseState
}
```

- Name after the operation or context: `CreateAccountState`, `LoginState`
- Variants as nested classes/objects

## Request/Response DTOs

Strict `Request`/`Response` suffixes — no `Dto` or `Params`:

```kotlin
@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class LoginResponse(
    val id: Long,
    @SerialName("access_token")
    val accessToken: String
)
```

- Placed in `domain/entity/remote/request/` and `domain/entity/remote/response/`
- Always `@Serializable`
- Use `@SerialName` for snake_case JSON mapping

## View Objects & Descriptors

| Suffix | Use | Example |
|--------|-----|--------|
| `Descriptor` | Sealed hierarchy describing device/UI variants | `MeshDeviceDescriptor` |
| `Content` | UI-ready data container for a screen | `HomeViewContent` |
| `ViewAction` | Sealed class of user actions | `HomeViewModelAction` |
