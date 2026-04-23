# Compose Theme Architecture

## Theme Types

4 theme types in `ThemeType` enum:

- `DEFAULT` — resolves to LIGHT/DARK based on system setting
- `LIGHT` — standard light theme
- `DARK` — standard dark theme
- `MIDNIGHT` — softer alternative to dark mode (uses "gray" key internally)

`DEFAULT` is never used directly in color resolution — always resolved first via
`resolveForDefault(isDarkMode)`.

## Architecture Layers

```
AppTheme (ui_components / ui_components_v2)
  └─ SharedAppTheme (common_ui) — orchestrates CompositionLocal providers
       ├─ LocalColors provides ExtendedColorScheme
       ├─ LocalThemeState provides ThemeState
       ├─ LocalSnackbarHostState provides SnackbarHostState
       └─ PlatformSpecificAppTheme (expect/actual)
            ├─ Android: status bar + nav bar color, light/dark appearance
            └─ iOS: plain MaterialTheme wrapper
```

## Color System

Two-part color scheme per theme:

```kotlin
ExtendedColors(
    colors: ColorScheme,          // Material 3 standard colors
    extendedColors: ExtendedColorScheme  // Brand-specific colors
)
```

ExtendedColorScheme provides brand colors Material 3 doesn't cover: `canvasAccent`,
`sliderEnabled/Disabled`, `shadow`, `spotlight`, `success`, `warning`, `label`, etc.

Access extended colors: `LocalColors.current.success`

## CompositionLocal Usage

| Local | Type | Purpose |
|-------|------|---------|
| `LocalColors` | `staticCompositionLocalOf` | Extended brand colors |
| `LocalThemeState` | `compositionLocalOf` | Mutable theme type (runtime switching) |
| `LocalSnackbarHostState` | `staticCompositionLocalOf` | Shared snackbar host |

Use `staticCompositionLocalOf` for values that rarely change. Use `compositionLocalOf` for mutable
state (theme switching).

## Color Resolution

Colors are injected via lambda, not hardcoded:

```kotlin
SharedAppTheme(
    extendedColorsResolver = { themeType ->
        when (themeType) {
            ThemeType.LIGHT -> LightColors
            ThemeType.DARK -> DarkColors
            ThemeType.MIDNIGHT -> MidnightColors
            else -> LightColors
        }
    }
)
```

Each UI library (ui_components, ui_components_v2) defines its own color sets and `AppTheme`
composable wrapping `SharedAppTheme`.

## Color Naming Convention

Color constants follow: `md_theme_{variant}_{role}`

```kotlin
val md_theme_light_primary = Color(0xFFFF4800)
val md_theme_dark_primary = Color(0xFFD83200)
val md_theme_midnight_primary = Color(0xFFD83200)
```

Disabled state: `Color.asDisabled()` → `copy(alpha = 0.38f)`

## Platform Differences

- **Android**: Sets status bar/nav bar colors and appearance (light/dark icons) via
  `WindowCompat.getInsetsController`
- **iOS**: Simple `MaterialTheme` wrapper — no system bar customization
