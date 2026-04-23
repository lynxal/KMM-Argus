# Logging Conventions

## Two Logging Systems

**`MeshLogger`** — for the `lynxmesh` module (BT Mesh protocol stack):
```kotlin
MeshLogger.d("Transaction took ${timeMs}ms",
    identifier = MeshLoggerInterface.LogIdentifier.Data)
MeshLogger.e("Failed", identifier = LogIdentifier.Domain, throwable = e)
```

**`Logger`** — for application-level code (`shared`, `ui_components`, etc.):
```kotlin
Logger.tag("Zone state").debug("Starting retrieval for zone $zoneId")
Logger.error("Operation failed", throwable)
```

These are intentionally separate. MeshLogger is for protocol-level operations; Logger is for app logic.

## MeshLogger Identifiers

Use the `LogIdentifier` enum for structured tagging:

| Identifier | Usage |
|---|---|
| `Data` | Database, storage, transactions |
| `Domain` | Domain logic, entity operations |
| `UseCase` | Use case execution |
| `Transport` | Network/transport layer |
| `Crypto` | Cryptographic operations |
| `Radio` | BLE radio communication |
| `Ble` | Bluetooth LE specific |
| `System` | System-level operations |
| `Common` | Default/generic |

## Logger Tag Convention

Tags describe the **feature/domain area**, not the class name:

```kotlin
// Good
Logger.tag("Zone state").debug("Retrieval complete")
Logger.tag("Hub connection").debug("State: $state")
Logger.tag("Device config").error("Failed", e)

// Avoid
Logger.tag("ZoneStateRetrievalUseCaseImpl").debug("...")
```

## Log Levels

- **error** — Failures requiring attention. Always include throwable if available
- **debug** — State changes, operation progress, useful for development
- **verbose** — High-volume data (HTTP bodies, raw BLE data)

## Duration Tracking

Log execution time for DB transactions and critical operations:

```kotlin
val startTime = Clock.System.now()
// ... operation ...
val duration = Clock.System.now() - startTime
MeshLogger.d("Transaction took ${duration.inWholeMicroseconds / 1000.0}ms",
    identifier = LogIdentifier.Data)
```

## HTTP Logging

HTTP bodies are chunked at 512 characters to prevent log overflow. Handled by `CustomHttpLogger`.
