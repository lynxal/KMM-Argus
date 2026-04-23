# Event Instrumentation

## Where to Track

Flexible — track where it makes most sense:
- **Repositories**: Infrastructure events (API calls, state changes, transport method)
- **Use cases**: Domain events (provisioning, configuration)
- **Screen models**: UI events (screen views, button clicks)

## Event Naming

Freeform events use `snake_case` verb phrases:

```
all_on_off_set
on_off_set
scene_recalled
device_provisioned
```

## Standard Extras

Always include relevant context in extras:

```kotlin
Analytics.track(
    event = "all_on_off_set",
    extras = mapOf(
        "is_on" to isOn,
        "executionTime" to duration.inWholeMilliseconds,  // Duration in ms
        "overBluetooth" to overBluetooth,                 // Transport method
        "isSuccess" to result.isSuccess,                  // Outcome
    )
)
```

| Extra key | Type | When to include |
|-----------|------|----------------|
| `executionTime` | Long (ms) | Operations with measurable duration |
| `isSuccess` | Boolean | Operations that can fail |
| `overBluetooth` | Boolean | Dual-transport operations (BLE vs cloud) |
| `errorCode` | String | On failure, include error code |
| `errorMessage` | String | On failure, include message |

## Duration Tracking

```kotlin
val startTime = Clock.System.now()
// ... operation ...
val endTime = Clock.System.now()
val durationMs = (endTime - startTime).inWholeMilliseconds
```

Use `Clock.System.now()` (Kotlin multiplatform) — not platform-specific time APIs.

## UI Events

Use structured API for UI interactions:

```kotlin
// Screen viewed
Analytics.track(AnalyticsSource.Screen, AnalyticsAction.Viewed,
    mapOf(AnalyticsKey.Screen.value to "home"))

// Button clicked
Analytics.track(AnalyticsSource.Button, AnalyticsAction.Clicked,
    mapOf(AnalyticsKey.Id.value to "add_device"))
```

## Action Tracking (UI Primitives)

Interactive UI primitives in `ui_components_v2/primitives/` have built-in analytics tracking. Each
component fires events automatically when the user interacts with it.

### Components and Events

| Component | Event | Source | Action | Extras |
|-----------|-------|--------|--------|--------|
| `CanvasRoundedButton` | `button_clicked` | Button | Clicked | id, screen, dialog |
| `CanvasIconButton` | `icon_button_clicked` | IconButton | Clicked | id, screen, dialog |
| `CanvasBackButton` | `button_clicked` | Button | Clicked | id, screen, dialog |
| `CanvasSwitch` | `switch_toggled` | Switch | Toggled | id, screen, dialog, value |
| `CanvasCheckbox` | `checkbox_clicked` | Checkbox | Clicked | id, screen, dialog, value |

### Required `id` Parameter

All tracked components require an `id: String` parameter (no default value). Pass a descriptive
snake_case identifier:

```kotlin
CanvasIconButton(id = "back", onClick = { ... }) { Icon(...) }
CanvasSwitch(id = "device_power", checked = isOn, onCheckedChanged = { ... })
```

Common IDs: `"back"`, `"close"`, `"menu"`, `"search"`, `"add"`, `"notifications"`.

For preview composables, pass `id = ""`.

### Value Tracking

`CanvasSwitch` and `CanvasCheckbox` include the new state in extras via `AnalyticsKey.Value`:

```kotlin
// Switch sends: value = "true" or "false"
// Checkbox sends: value = "true" (On) or "false" (Off)
```

### Migration Rule

All raw `IconButton` usages in `ui_components_v2` must use `CanvasIconButton` instead. Do not
import `androidx.compose.material3.IconButton` directly in view or component files.

---

## Compose Screen Tracking (ui_components_v2)

### `ScreenTrackingEffect`

**Location:** `analytics/.../data/ScreenTrackingEffect.kt`

Two overloads — a side-effect-only version and a content-wrapping version:

```kotlin
// Side-effect only — fires viewed/exited, no LocalScreenName provided
@Composable
fun ScreenTrackingEffect(name: String, extraData: Map<String, String> = emptyMap())

// Content-wrapping — fires viewed/exited AND provides LocalScreenName for button context
@Composable
fun ScreenTrackingEffect(
    name: String,
    extraData: Map<String, String> = emptyMap(),
    content: @Composable () -> Unit
)
```

Both use `DisposableEffect(Unit)` internally:

- On enter: fires `Analytics.track(Screen, Viewed, mapOf("name" to name) + extraData)`
- On dispose: fires `Analytics.track(Screen, Exited, mapOf("name" to name) + extraData)`

The content-wrapping overload also provides `LocalScreenName` via `CompositionLocalProvider`, so
buttons in the subtree automatically report the correct screen name.

### Where to Place Tracking

**Route-backed screens** — track at the navigation layer in `AppNavigation.kt`:

```kotlin
entry<AccountRoute> {
    ScreenTrackingEffect("AccountView") { AccountScreenN3() }
}
```

View files for route-backed screens have NO analytics code. Tracking is centralized in
`AppNavigation.kt`.

**Non-route views** (tabs, drawers, embedded sub-views) — track inside the view:

```kotlin
// Tab view inside HomeView
ScreenTrackingEffect("DashboardView") {
    LazyVerticalStaggeredGrid(...) { ... }
}
```

**Conditional screens** (like ContainerScreenN3) — track per branch with `extraData`:

```kotlin
when (val state = containerState) {
    is ContainerState.Error -> {
        ScreenTrackingEffect(
            "ContainerViewError",
            extraData = mapOf(
                AnalyticsKey.ErrorCode.value to state.code.toString(),
                AnalyticsKey.ErrorMessage.value to state.message,
            )
        ) {
            // error content
        }
    }
}
```

### `LocalScreenName`

**Location:** `analytics/.../data/AnalyticsUtils.kt`

A `compositionLocalOf` that provides the current screen name to descendant composables. Buttons read
it to attach screen context to click events.

```kotlin
val LocalScreenName = compositionLocalOf { "" }
```

Do NOT set this manually via `CompositionLocalProvider`. The content-wrapping `ScreenTrackingEffect`
overload handles it internally. Buttons read `LocalScreenName.current` automatically.

### `AnalyticsAction.Exited`

**Location:** `analytics/.../AnalyticsAction.kt`

```kotlin
enum class AnalyticsAction(val value: String) {
    Clicked("clicked"),
    Received("received"),
    Viewed("viewed"),
    Exited("exited"),
}
```

Fired by `ScreenTrackingEffect`'s `onDispose` callback. Do not fire `Exited` manually.

### Anti-patterns

**Never write shared mutable state in composable bodies:**

```kotlin
// BAD: Runs on every recomposition, causes phantom events
analyticsState.screenAnalyticsContext.value = ScreenAnalyticsContext(name = "MyScreen")
```

The old `AnalyticsState.screenAnalyticsContext` is deprecated. Use `ScreenTrackingEffect` instead.

**Never add tracking inside route-backed view files:**

```kotlin
// BAD: Tracking belongs in AppNavigation.kt for route-backed screens
@Composable
fun AccountView(...) {
    ScreenTrackingEffect("AccountView") { ... }
}
```

**Never use `HorizontalPager` for tabs with screen tracking.** It pre-composes adjacent pages,
causing false `screen_viewed` events. Use `AnimatedContent`:

```kotlin
// GOOD: Only the active tab is composed
AnimatedContent(targetState = selectedTab, ...) { tab ->
    when (tab) {
        0 -> DashboardView(...)
        1
        -> ScenesView(...)
    }
}
```
