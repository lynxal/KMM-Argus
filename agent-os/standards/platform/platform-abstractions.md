# Platform Abstractions

Key differences in platform implementations beyond expect/actual declarations.

## BLE Scanning

| | Android | iOS |
|---|---------|-----|
| Library | Kable (wraps Android BLE) | Kable (wraps CoreBluetooth) |
| Default mode | `SCAN_MODE_BALANCED` | N/A (no mode selection) |
| Performance mode | `SCAN_MODE_LOW_LATENCY` | N/A |
| Duplicate handling | Report delay batching | `allowDuplicateKeys = true` |

- **Never use `SCAN_MODE_LOW_POWER`** on Android — discovery takes too long
- iOS `allowDuplicateKeys` is required for RSSI tracking

## HTTP Engine

| | Android | iOS |
|---|---------|-----|
| Engine | Ktor `OkHttp` | Ktor `Darwin` |
| TLS | System default | System default |
| Logging | `CustomHttpLogger` (512-char chunks) | Same |

## Database Pragmas

| | Android | iOS |
|---|---------|-----|
| Driver | `AndroidSqliteDriver` | `NativeSqliteDriver` |
| Foreign keys | Enabled via callback | `DatabaseConfiguration.Extended(foreignKeyConstraints = true)` |
| WAL mode | Explicitly enabled | Native driver default |
| SYNCHRONOUS | Set to 2 (FULL) | Native driver default |

## Device Identification

| | Android | iOS |
|---|---------|-----|
| Source | `Settings.Secure.ANDROID_ID` | iOS Keychain (Valet) |
| Persistence | Device-scoped (resets on factory reset) | Survives app reinstalls |
| Format | UUID hash via `nameUUIDFromBytes()` | Generated UUID stored in keychain |
| Key | N/A | `"CanvasKeys"` / `"deviceIdentifier"` |

## Country Code Detection

| | Android | iOS |
|---|---------|-----|
| Source | `TelephonyManager` (SIM/network ISO) | `NSLocale.autoupdatingCurrentLocale.regionCode` |
| Constructor | Requires `Context` | No params |

## Local Key-Value Storage

| | Android | iOS |
|---|---------|-----|
| Backend | `SharedPreferences` | `NSUserDefaults` |
| Key format | Plain key | Namespaced: `"$storageName.$key"` |

## Permissions

Android requires explicit manifest declarations for BLE:
- Legacy (API <=30): `BLUETOOTH`, `BLUETOOTH_ADMIN`
- Modern (API 31+): `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`
- Location: `ACCESS_FINE_LOCATION` (required for BLE scanning)

iOS handles BLE permissions via Info.plist usage descriptions.
