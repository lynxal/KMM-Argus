# ScreenModel State Management

ScreenModels own UI state as a single unified `StateFlow`.

## State Declaration

```kotlin
class FeatureScreenModel(
    private val useCase: FeatureUseCase
) : ViewModel() {

    private val _viewState = MutableStateFlow(FeatureViewUiState.Loading)

    val viewState: StateFlow<FeatureViewUiState> = _viewState
        .onStart { loadData() }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(SUBSCRIPTION_TIMEOUT),
            FeatureViewUiState.Loading
        )
}
```

## Rules

- **Single StateFlow per ScreenModel** — no scattered `mutableStateOf` properties
- Existing ScreenModels with scattered state are legacy — migrate to unified StateFlow when touched
- Use `onStart { }` for lazy data loading on first subscription
- Sharing strategy: `SharingStarted.WhileSubscribed(SUBSCRIPTION_TIMEOUT)` — timeout configured in a single place
- Base class: `ViewModel()` from AndroidX Lifecycle (not Voyager's `ScreenModel`)

## Action Handling

```kotlin
fun onUiAction(action: FeatureViewUiAction) {
    when (action) {
        is FeatureViewUiAction.OnRefresh -> refresh()
        is FeatureViewUiAction.OnItemClicked -> navigateToItem(action.id)
    }
}
```

- `when`-expression maps actions to handler methods
- Use case calls wrapped in `viewModelScope.launch`
- Use `Result.onSuccess`/`onFailure` — not try/catch

## State Updates

```kotlin
private fun loadData() {
    viewModelScope.launch {
        _viewState.update { FeatureViewUiState.Loading }
        useCase.execute().onSuccess { data ->
            _viewState.update { FeatureViewUiState.Idle(data) }
        }.onFailure { error ->
            _viewState.update { FeatureViewUiState.Error(error.message) }
        }
    }
}
```

- Use `_viewState.update { }` for atomic state transitions
- State variants: Loading → Idle / Error (sealed class)

## Legacy (BaseScreenModel) — Do Not Use

`BaseScreenModel<T : ViewAction>` with `handleAction()` and `ActionHandler` is legacy Voyager-era code. New ScreenModels must use `ViewModel()` with `onUiAction()`.
