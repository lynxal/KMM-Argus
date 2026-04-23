# N3 Navigation Architecture

## Migration Status

Voyager → Navigation 3 migration is **in progress**. New screens use N3. Legacy Voyager screens
are being migrated gradually.

- N3 screens: `@Composable fun XxxScreenN3()` — plain composable functions
- Legacy screens: `class XxxScreen : Screen` — Voyager class-based

## Route Definition

All routes are `@Serializable` data objects/classes implementing `NavKey`:

```kotlin
@Serializable sealed interface AppRoute : NavKey

@Serializable data object LoginRoute : AppRoute
@Serializable data object HomeRoute : AppRoute
@Serializable data class RoomDetailsRoute(val roomId: Long) : AppRoute
```

Routes are registered in `NavConfiguration` with polymorphic serializers for state persistence
across process death.

## DebouncedNavigation

All N3 screens use `rememberDebouncedNavigation()` — never raw `NavBackStack`:

```kotlin
@Composable
fun MyScreenN3() {
    val navigation = rememberDebouncedNavigation()
    // navigation.navigate(SomeRoute)
    // navigation.navigateBack()
    // navigation.replace(SomeRoute)
    // navigation.popToRoot()
}
```

200ms debounce prevents duplicate screen pushes from rapid taps. This was a real bug and is also
preventive given slow BLE operations + screen transitions.

## N3 Screen Structure

Standard pattern for all N3 screens:

```kotlin
@Composable
fun ExampleScreenN3() {
    val navigation = rememberDebouncedNavigation()
    val screenModel = remember { appInfo.getKoin().get<ExampleScreenModel>() }
    val state by screenModel.viewState.collectAsStateWithLifecycle()

    ExampleView(
        uiState = state,
        onUiAction = { action ->
            when (action) {
                is NavigationAction -> navigation.navigate(...)
                else -> screenModel.onUiAction(action)
            }
        }
    )
}
```

Key rules:
- Screen models come from Koin DI, wrapped in `remember {}`
- Navigation actions handled in the screen composable, not forwarded to screen model
- Business logic actions forwarded to `screenModel.onUiAction()`
- State collected via `collectAsStateWithLifecycle()`

## App Navigation Tree

```kotlin
@Composable
fun AppNavigationN3(startRoute: AppRoute) {
    val backStack = rememberNavBackStack(navConfiguration, startRoute)
    CompositionLocalProvider(LocalNavBackStack provides backStack) {
        NavDisplay(
            backStack = backStack,
            entryProvider = entryProvider<NavKey> {
                entry<LoginRoute> { LoginScreenN3() }
                entry<HomeRoute> { HomeScreenN3() }
                // ...
            },
            transitionSpec = { slideInHorizontally(...) togetherWith slideOutHorizontally(...) },
            popTransitionSpec = { /* reverse slide */ }
        )
    }
}
```

## Nested Navigation

Multi-step flows use a separate nested `NavBackStack`:

```kotlin
@Composable
fun AddDeviceScreenN3() {
    val navigation = rememberDebouncedNavigation()       // Main nav
    val nestedBackStack = rememberNavBackStack(navConfiguration, NearbyDevicesRoute)  // Nested

    // Back: try nested first, then exit flow
    val navigatedBack = nestedBackStack.navigateBack()
    if (!navigatedBack) navigation.navigateBack()
}
```

## Auth-Based Root Navigation

`MainNavigationN3` switches between auth/unauth trees using `key(isSignedIn)`:

```kotlin
key(isSignedIn) {
    if (isSignedIn) AppNavigationN3(startRoute = AuthenticatedUserRouterRoute)
    else AppNavigationN3(startRoute = LandingRoute)
}
```

`key()` forces full re-creation of the navigation tree on auth state change.
