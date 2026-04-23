# Analytics Architecture

## Core Design

Singleton `Analytics` object with pluggable delegate backends.

```kotlin
// Initialization (in AppInfo.onAppInitialized)
Analytics.setEnabled(true)
Analytics.addDelegate(getKoin().get<AnalyticsDelegate>())
Analytics.setGlobalProperty(AnalyticsGlobalProperty.DeviceId, getDeviceIdentifier())
```

## Delegate Pattern

Backends implement `AnalyticsDelegate` interface. Multiple delegates can be registered.
Backends are **environment-specific** (Dev, Stage, Prod) and may change over time.

Current backends:
- **Amplitude** — primary event tracking
- **Firebase Analytics** — secondary tracking

## Thread Safety

- `Mutex` guards concurrent access to delegate list
- All tracking dispatched on `Dispatchers.IO` via `SupervisorJob`
- Fire-and-forget — tracking never blocks callers

## Two Tracking APIs

### Structured (UI components)

```kotlin
Analytics.track(
    source = AnalyticsSource.Button,
    action = AnalyticsAction.Clicked,
    extras = mapOf("screen" to "home")
)
// Produces event: "button_clicked"
```

Sources: `Screen`, `Dialog`, `Button`, `Navigation`, `Notification`
Actions: `Clicked`, `Received`, `Viewed`

### Freeform (business logic)

```kotlin
Analytics.track(
    event = "all_on_off_set",
    extras = mapOf("is_on" to isOn, "isSuccess" to result.isSuccess)
)
```

- Use in repositories and use cases
- snake_case event names

## Global Properties

| Property | Key | Purpose |
|----------|-----|--------|
| `UserId` | `user_identifier` | User account ID |
| `UserName` | `user_name` | Display name |
| `UserEmail` | `user_email` | Account email |
| `DeviceId` | `device_identifier` | Hardware device ID |

Set once at app init and on login. Attached to all subsequent events.
