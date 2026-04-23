# Topology Optimization

During Step 2 of post-provisioning configuration, `SetupDeviceFeaturesUseCase` intelligently
enables mesh network features. Thresholds are empirically tuned.

## Proxy Enablement

Proxy capability allows BLE-connected phones to communicate with the mesh.

```
Relay device?          → Never proxy
No proxies in zone?    → Enable proxy
1 relay + 1 proxy?     → Enable (add redundancy)
<4 proxies + RSSI OK?  → Enable (if <2 nearby proxies)
Else                   → Don't enable
```

- **RSSI threshold**: -70 dBm minimum signal strength
- **Target**: 2-4 proxies per zone
- Relay devices are excluded from proxy role

## Relay Enablement

Relay capability forwards mesh messages to extend range.

```
Device is relay-type?  → Always enable
Not a proxy + <1 relay in zone? → Enable
Else                   → Don't enable
```

- Relay and proxy are mutually exclusive roles
- At least 1 relay per zone

## Friend Enablement

Friend capability supports low-power devices.

- **Always enabled** on all devices
- Low-power devices need at least one friend in range

## Decision Flow

```kotlin
// SetupDeviceFeaturesUseCase
val shouldEnableProxy = when {
    isRelayDevice -> false
    proxiesInZone == 0 -> true
    relaysInZone == 1 && proxiesInZone == 1 -> true
    relaysInZone > 0 && proxiesInZone < 4
        && nodeRssi >= minRssi && proxies.size < 2 -> true
    else -> false
}

val shouldEnableRelay = isRelayDevice
    || (!shouldEnableProxy && relaysInZone < 1)
```

## Reachability Filter

Before counting proxies/relays in a zone, `SetupDeviceFeaturesUseCase` filters out unreachable nodes using `NodeStorage` connectivity state:

```
connected == true   -> reachable (count it)
connected == false  -> unreachable (exclude)
connected == null   -> check if state retrieval has run:
    any node has definitive state? -> unreachable (node never responded)
    no definitive states exist?    -> reachable (optimistic fallback)
```

This handles phantom proxies (factory-reset devices still recorded as `proxy=ENABLED` in mesh DB) and offline nodes. When state retrieval hasn't run (phone not connected), the filter degrades to current behavior.

## Deletion Guard

`ResetAndRemoveDeviceUseCase` uses space-scoped, reachability-aware logic before allowing proxy deletion:

```
Find root space containing the node
Count reachable proxies in space tree (space + sub-spaces)

Reachable proxies remain?        -> Allow deletion
Last node in space tree?         -> Allow deletion
Node itself is unreachable?      -> Allow (phantom cleanup)
Otherwise                        -> Block (last working proxy)
```

A proxy serves nodes in its space and sub-spaces. Removing it when dependent nodes have no other reachable proxy leaves them unreachable. Phantom (unreachable) proxies can always be deleted since they provide no connectivity.

## Key Constants

| Constant | Value | Purpose |
|----------|-------|--------|
| Min RSSI | -70 dBm | Signal strength threshold for proxy |
| Max proxies/zone | 4 | Upper bound before skipping |
| Nearby proxy limit | 2 | Max proxies in immediate vicinity |
