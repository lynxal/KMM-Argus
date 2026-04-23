# N3 vs Voyager Screen Patterns

## Migration Rule

- **New screens**: Must use N3 pattern
- **Modifying existing Voyager screens**: BaseScreenModel/ActionHandler is acceptable
- **Never** create new Voyager screens

## Structural Comparison

| Aspect | Voyager (Legacy) | Navigation 3 |
|--------|-----------------|--------------|
| Screen | `class MyScreen : Screen` | `@Composable fun MyScreenN3()` |
| Model | `BaseScreenModel<T : ViewAction>` extending `ScreenModel` | Plain class from Koin DI |
| Scope | `screenModelScope` (Voyager lifecycle) | `viewModelScope` or injected scope |
| Navigation | `rememberActionHandler<ActionType>` | `DebouncedNavigation.navigate(route)` |
| State | `mutableStateOf` in ScreenModel | `StateFlow` + `collectAsStateWithLifecycle()` |
| Actions | Sealed `ViewAction` + `ActionHandler` | `onUiAction` lambda with `when` routing |

## N3 Screen Template

```kotlin
@Composable
fun FeatureScreenN3() {
    val navigation = rememberDebouncedNavigation()
    val screenModel = remember { appInfo.getKoin().get<FeatureScreenModel>() }
    val state by screenModel.viewState.collectAsStateWithLifecycle()

    FeatureView(
        uiState = state,
        onUiAction = { action ->
            when (action) {
                is FeatureUiAction.Back -> navigation.navigateBack()
                is FeatureUiAction.OpenDetail -> navigation.navigate(DetailRoute(action.id))
                else -> screenModel.onUiAction(action)
            }
        }
    )
}
```

## Key Differences

1. **No `rememberActionHandler`** in new N3 screens — use `onUiAction` lambda directly
2. **Navigation actions** handled in the screen composable, not forwarded to model
3. **Business logic actions** forwarded to `screenModel.onUiAction()`
4. **Screen model** obtained via `remember { appInfo.getKoin().get<T>() }`, not Voyager's
   `getScreenModel()`
5. **N3 suffix** (`ScreenN3`) distinguishes migrated screens during transition period

## Legacy BaseScreenModel

```kotlin
// DO NOT use for new screens
abstract class BaseScreenModel<T : ViewAction> : ActionHandler<T>(), ScreenModel {
    init {
        screenModelScope.launch { startCollectingActions() }
    }
}
```

This bridges Voyager's `ScreenModel` lifecycle with the custom `ActionHandler` debouncing system.
N3 replaces this with `DebouncedNavigation` (200ms debounce built in).
