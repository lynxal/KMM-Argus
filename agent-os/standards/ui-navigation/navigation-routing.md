# Navigation Routing

All navigation uses Navigation3 with type-safe sealed routes.

## Route Definitions

All routes are defined in `AppRoute` sealed interface. Each route is `@Serializable`.

```kotlin
@Serializable
sealed interface AppRoute {
    @Serializable data object HomeRoute : AppRoute
    @Serializable data class RoomDetailsRoute(val roomId: String) : AppRoute
}
```

- Route params must be `@Serializable` types
- Use serializable data classes for complex params — do not pass JSON strings
- Simple params (String, Int, Boolean) are passed directly

## Debounced Navigation

All screens use `rememberDebouncedNavigation()` to prevent rapid consecutive taps.

```kotlin
val navigation = rememberDebouncedNavigation()
```

- Debounce value is configured in a single place (default 200ms)
- Do not bypass debouncing or create custom navigation wrappers
- All navigation calls go through `DebouncedNavigation`

## Animations

- Forward: slide in from right, slide out to left
- Back: slide in from left, slide out to right
- Configured globally in `AppNavigationN3` — do not set per-screen animations

## Legacy JSON Route Params — Do Not Use

Some existing routes pass data as `navigationDataJson: String`. This is a temporary workaround. New routes must use `@Serializable` data classes for all parameters. Migrate existing JSON params when touched.
