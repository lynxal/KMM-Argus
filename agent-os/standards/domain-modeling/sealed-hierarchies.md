# Sealed Hierarchies

## sealed interface vs sealed class

- `sealed interface` — subtypes have no shared properties
- `sealed class` — subtypes share common fields via constructor

Default to `sealed interface`. Use `sealed class` only when shared state is needed.

## Operation Result States

Model operation outcomes as sealed interfaces with nested variants:

```kotlin
sealed interface LoginState {
    data object Success : LoginState
    sealed class Error(message: String) : LoginState, Throwable(message) {
        data class ServerError(val code: Int, override val message: String) : Error(message)
        data class CredentialError(val errors: Map<String, List<String>>, override val message: String) : Error(message)
        data class TimeoutError(override val message: String) : Error(message)
    }
}
```

**Rules:**
- Top level: `sealed interface` (Success has no shared fields with Error)
- Error family: `sealed class` extending both the state type AND `Throwable`
- Dual-purpose: errors work in `when` exhaustive matching AND can be thrown/caught
- Specific errors: `data class` with context-specific fields
- Success with no data: `data object`

## Device/Entity Type Hierarchies

For modeling product families with deep nesting:

```kotlin
sealed interface MeshDeviceDescriptor {
    val defaultName: String
    val numChannels: Int
    companion object {}

    data object UnknownDevice : MeshDeviceDescriptor { ... }

    open class CanvasDevice(...) : MeshDeviceDescriptor {
        open class LVPM(...) : CanvasDevice(...) {
            data object Small1ChBrightness : LVPM(...)
        }
    }
}
```

- Leaf types: `data object` (singleton) or `data class` (parameterized)
- Branch types: `open class` with constructor defaults
- Unknown/fallback: always provide a `data object UnknownX` variant

## Variant Naming

- `data object` for singletons: `Success`, `Loading`, `UnknownDevice`
- `data class` for variants with context: `ServerError(code, message)`
- Name variants by what they represent, not by type: `CredentialError` not `ErrorType2`
