# Function & Variable Naming

## Function Naming by Layer

### UseCase
- Primary method: `suspend fun execute(): Result<T>`
- No other public methods — one operation per use case

### Repository / Storage
- CRUD: `get*()`, `set*()`, `save*()`, `delete*()`
- All suspend functions

### Handler
- Action methods: `perform*()`, `process*()`
- Query methods: plain verb `statesSyncRequired()`, `modelStatusHandled()`

## Reactive Property Naming

**Hot flows** (StateFlow/SharedFlow) — expose as properties:

```kotlin
val userProfile: StateFlow<UserProfile?>
val modelStatusFlow: SharedFlow<ModelStatusWrapper>
```

**Cold flows** — expose via methods:

```kotlin
fun observeZoneStates(): Flow<List<ZoneState>>
```

## Backing Fields

Underscore prefix for mutable backing fields:

```kotlin
private val _userProfile = MutableStateFlow<UserProfile?>(null)
val userProfile: StateFlow<UserProfile?> = _userProfile.asStateFlow()
```

- Private mutable: `_fooBar`
- Public read-only: `fooBar`

## Constants

`UPPER_SNAKE_CASE` inside companion objects or top-level `object`:

```kotlin
object HttpRoutes {
    const val BASE_URL_FULL = "..."
    const val ACCOUNT_BASE = "..."
}
```

- Group related constants in named `object` singletons
- Use nested objects for subcategories

## Coroutine Naming

- Scope parameter: `coroutineScope: CoroutineScope`
- Job variables: descriptive name + `Job` suffix when tracking: `pollingJob`, `syncJob`
- Dispatcher context: use `withContext(coroutineScope.coroutineContext)`
