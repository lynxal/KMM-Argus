# Product Mission

## Problem

Kotlin engineers working on Canvas Control apps and IoT gateways have no viable on-device HTTP and log inspector:

- **Stetho** is unmaintained and broken on modern Chrome.
- **Flipper** was wound down by Meta in 2024.
- **Chucker** is OkHttp-only — no Ktor client support, no remote viewing, no log integration.
- **Proxyman / Charles** require certificate installation and system proxy configuration, which is painful on IoT hardware.
- **Nothing** on the market correlates HTTP traffic with application log events on a single unified timeline.

The result: engineers either ship blind on Ktor-based apps, rely on log scraping over adb/ssh, or spend hours standing up proxy infrastructure that doesn't survive a reboot on a customer's network.

## Target Users

- **Lynxal Android and Kotlin engineers** building Canvas Control mobile and embedded apps.
- **Canvas Hub firmware engineers** debugging cloud and LAN traffic on IoT gateway hardware.
- **QA engineers** inspecting real-device traffic on customer networks where proxies are impractical.

## Solution

**Argus** is a Kotlin-first, Ktor-native, KMP-ready on-device inspector that delivers Stetho-like developer experience without the Chrome DevTools dependency.

Key differentiators:

- **Ktor-native**: first-class Ktor `HttpClient` plugin capturing full request/response including bodies — the only tool in this space that starts here rather than bolting on OkHttp support.
- **Unified HTTP + log timeline**: HTTP traffic and application log events (via KMMLogging) are interleaved on a single timeline with source badges — no more tab-switching between a network panel and a log viewer.
- **On-device server, any browser**: an embedded Ktor server serves a static SPA and exposes REST + WebSocket over the LAN. Discovery happens via mDNS/DNS-SD through the existing `:lantern-android` module — open any browser on the same network and you're inspecting.
- **Zero friction on IoT hardware**: no certificates, no system proxy, no USB cable. Works on a Canvas Hub sitting on a customer's Wi-Fi.
- **Debug-only by design**: consumers wire Argus in via `debugImplementation` (and optionally a custom `stagingImplementation`). Release builds contain zero Argus code — no no-op shim, no dead weight, no release-time risk.
- **KMP-ready**: modules are structured so iOS support can land in Phase 4 without re-architecture.
