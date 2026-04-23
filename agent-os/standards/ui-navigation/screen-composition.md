# Screen Composition

Screens follow a 3-tier structure: Screen → ScreenModel → View.

## Structure

```kotlin
@Composable
fun FeatureScreen() {
    val navigation = rememberDebouncedNavigation()
    val screenModel = remember { appInfo.getKoin().get<FeatureScreenModel>() }
    val uiState by screenModel.viewState.collectAsStateWithLifecycle()

    FeatureView(
        uiState = uiState,
        onUiAction = { action ->
            when (action) {
                is Navigate -> navigation.navigate(route)
                else -> screenModel.onUiAction(action)
            }
        }
    )
}
```

## Rules

- **Screen** — Thin bridge: wires navigation, DI, and state collection. No business logic.
- **ScreenModel** — Obtained via Koin (`appInfo.getKoin().get<T>()`). Owns state as `StateFlow`. Use `parametersOf()` for constructor args.
- **View** — Pure composable receiving `(uiState, onUiAction)`. No navigation or DI awareness.
- Simple/stateless screens may skip the ScreenModel layer
- Use `collectAsStateWithLifecycle()` for state collection
- Use `LifecycleEventEffect(ON_RESUME)` for data refresh triggers

## N3 Suffix (Temporary)

During Voyager → Navigation3 migration, screens use `N3` suffix (e.g., `HomeScreenN3`). This suffix will be removed once migration completes. New screens should still use it until the cleanup pass.

## Legacy (Voyager) — Do Not Use

Old screens use `BaseScreenModel` + `ActionHandler` + `rememberActionHandler`. Do not create new screens with this pattern. Migrate existing ones when touched.
