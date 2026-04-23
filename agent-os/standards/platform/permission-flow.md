# Permission Flow

## Library

`kmm-permissions` (`com.lynxal.permissions:permissions`) — cross-platform permission handling.
Currently only `Permission.BLUETOOTH_LE` uses this flow.

Image picking uses `peekaboo` library (no runtime permission needed via kmm-permissions).
QR scanning is Android-specific (`QRScannerUtils.android.kt`).

## Permission States

```
UNKNOWN → UNDETERMINED (iOS only) → GRANTED
                                  → DENIED (can re-request)
                                  → DENIED_ALWAYS (requires app settings)
```

## Responsibility Split

- **Screen models**: Request permissions and manage UI state
- **Repositories**: Only CHECK permission state, never request

```kotlin
// Screen model — requests permission
permissionsController.requestPermission(Permission.BLUETOOTH_LE)

// Repository — only checks state
val state = permissionsController.requestPermissionState(Permission.BLUETOOTH_LE)
if (state == PermissionState.GRANTED) { /* proceed */ }
```

## Screen-Level Pattern

Every screen that needs BLE follows this exact flow:

```kotlin
@Composable
fun FeatureScreenN3() {
    val screenModel = remember { appInfo.getKoin().get<FeatureScreenModel>() }

    // 1. Bind controller to lifecycle (required for system dialogs)
    BindEffect(screenModel.permissionsController)

    // 2. Observe permission state
    val bluetoothPermissionState by remember { screenModel.bluetoothPermissionState }

    // 3. Check on state change
    LaunchedEffect(bluetoothPermissionState) {
        screenModel.onUiAction(CheckBluetoothPermission)
    }
}
```

## Screen Model Pattern

```kotlin
class FeatureScreenModel(
    val permissionsController: PermissionsController,
    // ...
) {
    val bluetoothPermissionState: MutableState<PermissionState?> = mutableStateOf(null)

    // Check: query current state
    suspend fun handleCheckPermission() {
        val state = permissionsController.requestPermissionState(Permission.BLUETOOTH_LE)
        bluetoothPermissionState.value = state
    }

    // Request: trigger system dialog, then re-check
    suspend fun handleRequestPermission() {
        permissionsController.requestPermission(Permission.BLUETOOTH_LE)
        val state = permissionsController.requestPermissionState(Permission.BLUETOOTH_LE)
        bluetoothPermissionState.value = state
    }
}
```

## BLE Operation Guards

Always check permission before BLE operations:

```kotlin
fun startScanner() {
    if (bluetoothPermissionState.value == PermissionState.GRANTED) {
        viewModelScope.launch {
            meshApi.connectionManager.startProvisioningScanner()
        }
    }
}
```

## DI Registration

```kotlin
// Android — requires Application context
single<PermissionsController> { PermissionControllerImpl(androidApplication()) }

// iOS — no context needed
single<PermissionsController> { PermissionControllerImpl() }
```
