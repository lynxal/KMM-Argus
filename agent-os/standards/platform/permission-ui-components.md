# Permission UI Components

## UI State Routing

Route UI based on `PermissionState`:

```kotlin
when (bluetoothPermissionState) {
    PermissionState.GRANTED -> {
        // Main content — BLE features available
    }
    PermissionState.UNKNOWN, PermissionState.UNDETERMINED -> {
        PermissionsDialog(onRequestPermissions = { requestPermission() })
    }
    PermissionState.DENIED_ALWAYS -> {
        BluetoothPermissionsDenied(onTroubleshoot = { navigateToSettingsGuide() })
    }
    PermissionState.DENIED -> {
        // Can re-request — show dialog again
        PermissionsDialog(onRequestPermissions = { requestPermission() })
    }
}
```

## Components

| Component | When shown | Action |
|-----------|-----------|--------|
| `PermissionsDialog` | UNKNOWN / UNDETERMINED / DENIED | Triggers system permission request |
| `BluetoothPermissionsDenied` | DENIED_ALWAYS | Shows troubleshooting steps, links to settings |

## Platform-Specific Text

Permission screens use platform-specific strings from moko-resources:

```
title_bluetooth_permissions_android / title_bluetooth_permissions_ios
description_bluetooth_permissions_android / description_bluetooth_permissions_ios
label_permissions_ble_step_1_android / label_permissions_ble_step_1_ios
label_permissions_ble_step_2_android / label_permissions_ble_step_2_ios
label_permissions_ble_step_3_android / label_permissions_ble_step_3_ios
```

This pattern (platform-suffixed strings for system-referencing UI) is evolving and may expand
beyond permissions to any UI that references platform settings or behaviors.

## Troubleshooting Steps

Each platform gets step-by-step instructions guiding users to enable permissions in system settings.
These steps reference platform-specific UI (e.g., "Settings > Apps > Canvas" on Android,
"Settings > Privacy > Bluetooth" on iOS).
