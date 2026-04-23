# Delegate Composition

Use delegates to decompose complex multi-step operations into composable, reusable units.

## When to Use

- BLE mesh state retrieval (primary use case)
- Any domain requiring sequential multi-step operations with shared orchestration
- When sub-operations vary by device type, property type, or context

## Structure

```kotlin
interface OperationDelegate {
    suspend fun initialize(context: Context)
    suspend fun performGroupCall(context: Context)
    suspend fun performPerDeviceCall()
    fun isSuccessful(): Boolean
}
```

### Abstract Base

```kotlin
abstract class AbstractOperationDelegate : OperationDelegate {
    protected val pendingItems = mutableListOf<Int>()
    private val mutex = Mutex()

    // Shared logic: timing, pending item tracking, mutex-locked updates
    // Subclasses implement domain-specific behavior
}
```

### Concrete Delegates

Each delegate handles one specific property/operation type:

```kotlin
class LightnessStateDelegate(...) : AbstractOperationDelegate() {
    override suspend fun performGroupCall(context) { /* lightness-specific */ }
}

class CtlStateDelegate(...) : AbstractOperationDelegate() {
    override suspend fun performGroupCall(context) { /* CTL-specific */ }
}
```

## Orchestrating Use Case

```kotlin
abstract class AbstractStateRetrievalUseCase : UseCase {
    abstract fun retrieveCommandChain(): List<OperationDelegate>

    suspend fun execute(id: Long): Result<Boolean> {
        val delegates = retrieveCommandChain()
        delegates.forEach { delegate ->
            delegate.initialize(id)
            delegate.performGroupCall(id)
            // wait, retry per-device, process responses
        }
        return Result.success(delegates.all { it.isSuccessful() })
    }
}
```

Concrete use cases compose delegate chains:

```kotlin
class ZoneMixedStateRetrievalUseCase : AbstractStateRetrievalUseCase() {
    override fun retrieveCommandChain() = listOf(
        koin.get<LightnessStateDelegate>(),
        koin.get<LcModeStateDelegate>()
    )
}
```

## Rules

- One delegate = one operation type. Do not mix concerns.
- Delegates are stateful per-execution — register as `factory` in Koin, not `single`
- Mutex locking is used in state retrieval delegates to prevent concurrent mesh conflicts (not required for all mesh operations)
- Obtain delegates via Koin DI, not direct instantiation
- The orchestrating use case controls sequencing and retry logic
