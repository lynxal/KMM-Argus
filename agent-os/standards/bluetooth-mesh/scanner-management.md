# Scanner Management

Dual scanner architecture in `KableBleConnectionManager` using Kable library.

## Threading

```kotlin
val coroutineScope = CoroutineScope(Dispatchers.IO.limitedParallelism(1) + SupervisorJob())
```

All scanner and advertisement operations serialized through single-threaded scope. `SupervisorJob` prevents cascade failures.

## Dual Scanners

- **Standard scanner**: `SCAN_MODE_BALANCED` (Android) — aggregated advertisement flows
- **Low-latency scanner**: `SCAN_MODE_LOW_LATENCY` (Android) — real-time device discovery flows
- iOS: both use same config with `allowDuplicateKeys = true`

## Activation Flags

```kotlin
private var proxyScannerActive: Boolean = false
private var provisioningScannerActive: Boolean = false
```

- `startProxyScanner(timeout)` / `startProvisioningScanner(timeout)` set flags, call `startScanner()`
- `stopScanner()` only stops hardware scanner if BOTH flags are false (dual-use prevention)
- Timeout-based auto-stop prevents battery drain from forgotten flags

## Advertisement Resolution

Two distinct advertisement types from different device states:

1. **Node identity** — advertised by unprovisioned nodes
   - Contains `nodeHash` + `nodeRandom` (from 16-byte node identity payload)
   - Resolved via `meshNetworkRepository.resolveNetworkUuid(nodeHash, nodeRandom)`
   - Returns `Pair<Long, String>` (nodeAddress, meshUuid)

2. **Network identity** — advertised by provisioned proxy nodes
   - Contains 8-byte network ID
   - Matched against `networkKey.networkKeyId` or `networkKey.oldNetworkKeyId`
   - Sets `meshUuid` if network key match found

## Advertisement Storage

`AdvertisementRuntimeStorage`: Mutex-protected map + SharedFlow(replay=1):
- `modify()` — atomic map update + flow emission
- `transform()` — read-only view under lock
- Two separate pools: `proxyAdvertisements` and `provisionerAdvertisements`

## Proxy Selection

- `resolveBestProxyCandidate()`: polls 30s, filters last 10s by timestamp, picks max RSSI
- `getNearbyProxies(minRssi = -65)`: RSSI threshold filtering for proximity detection
