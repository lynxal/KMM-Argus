# Flow Composition

## Multi-Source Aggregation

Use `combine()` + `collectLatest()` to merge independent state sources:

```kotlin
combine(
    repoA.stateFlow,
    repoB.stateFlow,
    repoC.stateFlow
) { a, b, c ->
    Triple(a, b, c)
}.collectLatest { (a, b, c) ->
    // Process combined state
}
```

- `Pair` for 2 sources, `Triple` for 3
- For 4+ sources, use a named data class
- `collectLatest()` cancels previous processing when any upstream changes

## ScreenModel stateIn Convention

All ScreenModel view states use `WhileSubscribed(5000)`:

```kotlin
val viewState = _viewState.onStart {
    initStates()
}.stateIn(
    viewModelScope,
    SharingStarted.WhileSubscribed(5000),
    InitialUiState()
)
```

- **5-second timeout** survives orientation changes but frees resources after navigation
- `onStart {}` triggers initialization side effects (data loading)
- Initial value is the idle/loading UI state

## Init Block Collectors

ScreenModels collect repository flows in `init {}`:

```kotlin
init {
    viewModelScope.launch {
        repository.connectionState.collectLatest { state ->
            // Update UI state
        }
    }
}
```

Each independent data source gets its own `launch` block.
