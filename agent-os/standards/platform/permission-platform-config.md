# Platform Permission Configuration

## Android (AndroidManifest.xml)

### Bluetooth Permissions

```xml
<!-- Legacy (API ≤ 30) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- Modern (API 31+) — runtime permissions -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
```

`BLUETOOTH_SCAN` is the primary runtime permission on Android 12+. Legacy permissions are
`maxSdkVersion="30"` for backward compatibility.

### Location (for BLE scanning)

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"
    tools:remove="android:maxSdkVersion" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"
    tools:remove="android:maxSdkVersion" />
```

The `tools:remove` is a legacy override (may not be needed on current min SDK 26).

### Other Permissions

```xml
<uses-permission android:name="android.permission.CAMERA" />          <!-- QR scanning -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
```

## iOS (Info.plist)

### Usage Descriptions (required)

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Our app uses bluetooth to find, connect and control Bluetooth Mesh devices</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>The location access is required</string>

<key>NSCameraUsageDescription</key>
<string>$(PRODUCT_NAME) camera description.</string>
```

### Background Modes

```xml
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
    <string>bluetooth-peripheral</string>
    <string>processing</string>
    <string>remote-notification</string>
</array>
```

### Required Device Capabilities

```xml
<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>bluetooth-le</string>
</array>
```

This ensures the app only installs on BLE-capable devices.
