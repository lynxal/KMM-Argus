# Use Case Convention

Use cases are one-shot operations encapsulating a single business action.

## Structure

```kotlin
class DoSomethingUseCase(
    private val repository: SomeRepository
) : UseCase {

    suspend fun execute(param: String): Result<Data> {
        return repository.fetchData(param)
            .mapCatching { it.toDomain() }
    }
}
```

## Rules

- Implement the `UseCase` marker interface
- Primary method: `suspend fun execute(...)` — not `invoke()`
- Return `Result<T>` — never throw exceptions
- One-shot only — do not return `Flow<T>`. Streaming belongs in repositories.
- Keep parameters simple (primitives, IDs). No request wrapper objects.
- Zero to few parameters. If you need many, the use case may be doing too much.

## DI Registration

Register in `DataModule.kt` via Koin:

```kotlin
singleOf(::DoSomethingUseCase)   // stateless (most use cases)
factory { DoSomethingUseCase(get()) }  // if parameterized/stateful
```

## Calling From ScreenModels

```kotlin
viewModelScope.launch {
    useCase.execute(id).onSuccess { data ->
        _viewState.update { it.copy(data = data) }
    }.onFailure { error ->
        _viewState.update { it.copy(error = error.message) }
    }
}
```

- Always call within `viewModelScope.launch` or `screenModelScope.launch`
- Use `onSuccess`/`onFailure` for Result handling — not try/catch
