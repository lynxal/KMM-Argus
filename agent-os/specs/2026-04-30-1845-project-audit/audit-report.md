# Argus — Project Audit Report

**Spec under review:** `argus-audit-spec.md` (repo root)
**Audit date:** 2026-04-30
**Audit depth:** static review only (no Gradle builds, no APK analysis, no benchmark/Lighthouse runs)
**Phase 3/4 modules:** treated as in-scope (per user decision), not flagged as drift

Findings are organized into eight per-area files under `findings/`; this report consolidates them.

---

## Executive summary

**Recommendation: ship with corrections.**

The codebase is fundamentally sound. Architecture, capture correctness, server behavior, and security all pass on static review. Code quality is high — no TODO/FIXME/HACK markers, no reflection in capture paths, no `runBlocking` in production, no platform code in `commonMain`, no committed secrets, no external network egress at runtime. The Ktor client plugin's streaming-safe channel teeing is genuine. Header redaction is enforced at capture time across all three engines (Ktor, OkHttp, HttpURLConnection) using a shared helper. The release-zero-classes invariant is enforced both by source-set seam and a `verifyReleaseHasNoArgus` Gradle task wired into CI.

The remediation list is moderate but real:

- **One latent correctness bug** in `:argus-urlconnection` that drops the response body on a `disconnect()`-before-`close()` path.
- **One K/N build risk** in `:argus-server-core` (`Dispatchers.IO` without the `kotlinx.coroutines.IO` import) that will break iOS Native compilation.
- **Documentation drift**: the README's "verbatim from `:sample`" claim is false; Configuration reference omits `persist*` + `fullBodyHosts` + `captureRequestBody`/`captureResponseBody`; module table omits `:argus-ios`/`:argus-okhttp`/`:argus-urlconnection`.
- **Design-artifact location drift**: `docs/design/` doesn't exist at the canonical path; design source lives under `design_handoff_argus_inspector/` and `argus-webui/src/design/`.
- **Three UI deviations** from spec §5.7: a "Load full body" button (forbidden), a hardcoded 3-segment "phased waterfall" that visually implies phase data the events don't carry (forbidden), and a keyboard shortcut divergence on `x` (spec says "clear with confirm"; impl maps `x→clearFilters`, `Shift+X→clearEvents` with toast + ⌘Z undo).
- **Test coverage gaps**: server routing tests live in `jvmTest` (spec wants `commonTest`); `:argus-android` and `:argus-ios` have no `ArgusServer.start()`/`stop()` smoke tests.
- **One architectural deviation by design**: `ArgusServer` is a plain class in `commonMain` (CIO is multiplatform), not the `expect class` the spec mandates. Recommend updating the spec, not the code.

Security posture is strong. The only confidently-flagged vulnerabilities are dev-only (Vite 5.4.10, esbuild 0.21.5 / 0.23.1) and never reach the on-device artifact. Several JVM dependencies need an online CVE check to close out.

Performance items (§6.5.3 throughput, §6.7.2–§6.7.6 runtime UI quality, §6.11 latency) are static-only as instructed and remain `unverified — requires runtime`.

---

## §6 Verification scorecard

| § | Item | Status | Findings file |
|---|------|--------|----------------|
| **6.1 — Architectural compliance** | | | [`findings/01-architecture.md`](findings/01-architecture.md) |
| 6.1.1 | No mDNS / Lantern dependency | ✅ pass | 01-architecture |
| 6.1.2 | `:argus-core` `commonMain` jvm/android/ios | ✅ pass | 01-architecture |
| 6.1.3 | `:argus-server-core` routing in `commonMain` + `expect class ArgusServer` | ⚠️ **deviation** — routing in `commonMain` ✓; `ArgusServer` is plain class in `commonMain`, not `expect/actual` (deliberate; CIO is multiplatform) | 01-architecture, 03-server, 08-phase34 |
| 6.1.4 | No CDP types | ✅ pass | 01-architecture |
| 6.1.5 | No `devtools-frontend` vendored | ✅ pass | 01-architecture |
| 6.1.6 | `:argus-webui-bundle` byte-array constants | ✅ pass | 01-architecture |
| 6.1.7 | No no-op module | ✅ pass | 01-architecture |
| **6.2 — Capture correctness** | | | [`findings/02-capture.md`](findings/02-capture.md) |
| 6.2.1 | Plugin captures all listed fields | ✅ pass | 02-capture |
| 6.2.2 | Errors captured (throwable + stack trace) | ✅ pass | 02-capture |
| 6.2.3 | Body cap + truncation marker | ✅ pass | 02-capture |
| 6.2.4 | Streaming-safe (no original-channel consumption) | ✅ pass — verified channel teeing via `ByteReadChannel.split` | 02-capture |
| 6.2.5 | Header redaction (case-insensitive, symmetric, defaults, flag) | ✅ pass | 02-capture |
| 6.2.6 | Log delegate captures all 5 levels | ✅ pass | 02-capture |
| 6.2.7 | Throwable cause chain recursed | ✅ pass | 02-capture |
| 6.2.8 | `NoopEventBus` is the default | ✅ pass | 02-capture |
| **6.3 — Distribution & CI** | | | [`findings/01-architecture.md`](findings/01-architecture.md) |
| 6.3.1 | Sample uses `debugImplementation` only | ✅ pass | 01-architecture, 05-sample |
| 6.3.2 | `src/main` (commonMain) has `DebugTools` interface, no Argus imports | ✅ pass | 01-architecture, 05-sample |
| 6.3.3 | `src/debug` `DebugToolsImpl` installs plugin + delegate | ✅ pass | 01-architecture, 05-sample |
| 6.3.4 | `src/release` `DebugToolsImpl` zero Argus imports | ✅ pass | 01-architecture, 05-sample |
| 6.3.5 | `assembleRelease` succeeds | 🟡 unverified — requires runtime | 01-architecture |
| 6.3.6 | `apkanalyzer` shows no `com.lynxal.argus.*` | 🟡 unverified — requires runtime (Gradle task `verifyReleaseHasNoArgus` exists and exceeds the apkanalyzer check) | 01-architecture |
| 6.3.7 | CI `verifyReleaseHasNoArgus` step | ✅ pass — wired in `.github/workflows/verifyRelease.yml` | 01-architecture |
| **6.4 — Server behavior** | | | [`findings/03-server.md`](findings/03-server.md) |
| 6.4.1 | `boundPort` exposed | ✅ pass | 03-server |
| 6.4.2 | `/api/info` shape | ✅ pass | 03-server |
| 6.4.3 | `/api/events` filter params | ✅ pass | 03-server |
| 6.4.4 | Raw-bytes `Content-Type` | ✅ pass | 03-server |
| 6.4.5 | DELETE clears + WS `cleared` broadcast | ✅ pass | 03-server |
| 6.4.6 | WS hello on connect, event frames live | ✅ pass | 03-server |
| 6.4.7 | WS reconnect dedup (id-based) | ⚠️ partial — server emits stable ids; explicit dedup is client-side webui responsibility | 03-server |
| 6.4.8 | CORS allowlist (debug-only, no wildcard) | ⚠️ partial — config-driven (no build-type gating); default `localhost:5173` is loopback-safe | 03-server, 07-security |
| 6.4.9 | Graceful port release on `stop()` | ✅ pass | 03-server |
| **6.5 — Ring buffer** | | | [`findings/03-server.md`](findings/03-server.md) |
| 6.5.1 | Oldest-evicted-first | ✅ pass | 03-server |
| 6.5.2 | Capacity configurable | ✅ pass | 03-server |
| 6.5.3 | 500/sec sustained no drops | 🟡 unverified — requires runtime (`LoadTest.kt` exists in `jvmTest`) | 03-server |
| **6.6 — Web UI design compliance** | | | [`findings/04-webui.md`](findings/04-webui.md) |
| 6.6.1 | `docs/design/` contains all required artifacts | ❌ **fail** — `docs/design/` does not exist; artifacts live under `docs/ui/` (4 PNGs) and `design_handoff_argus_inspector/` and `argus-webui/src/design/` | 04-webui |
| 6.6.2 | `tailwind.config.ts` derived from `tokens.json` | ✅ pass | 04-webui |
| 6.6.3 | No hex / px values outside Tailwind config | ⚠️ partial — 0 hex strays; 4 `text-[10px]` arbitrary values + sub-token sizes in `globals.css` | 04-webui |
| 6.6.4 | Components map to design specs | ✅ pass — every `design_handoff_argus_inspector/argus/*.jsx` has an implementation | 04-webui |
| 6.6.5 | Every screen state from mockups implemented | ⚠️ partial — only 4 populated-state mockups exist; empty/error/disconnected impls present but not screenshot-comparable | 04-webui |
| 6.6.6 | Empty / loading / error states for every view | ✅ pass | 04-webui |
| 6.6.7 | Keyboard shortcuts behave per `interactions.md` | ⚠️ partial — `interactions.md` doesn't exist; all 11 spec keys handled but `x` is mapped to `clearFilters` (not "clear with confirm"), `Shift+X` clears events with toast + ⌘Z undo | 04-webui |
| 6.6.8 | `prefers-reduced-motion` respected | ✅ pass | 04-webui |
| **6.7 — Web UI runtime quality** | | | [`findings/04-webui.md`](findings/04-webui.md) |
| 6.7.1 | Bundle < 100 KB gzipped | ✅ pass — JS+CSS gzip ≈ 30 KB; with self-hosted fonts ≈ 190 KB total payload (budget interpretation needs clarifying) | 04-webui |
| 6.7.2 | Lighthouse > 95 | 🟡 unverified — requires runtime | 04-webui |
| 6.7.3 | 10 000-event list scrolls smoothly | ✅ static signal — custom virtualization wired in `EventList/virtual.ts` | 04-webui |
| 6.7.4 | Waterfall 1 000 events < 100 ms | 🟡 unverified — requires runtime | 04-webui |
| 6.7.5 | Filter changes apply within one frame | ✅ static signal — fully client-side | 04-webui |
| 6.7.6 | Body search highlight < 50 ms | 🟡 unverified — requires runtime | 04-webui |
| 6.7.7 | No external network requests at runtime | ✅ pass — all fetches device-origin; fonts self-hosted; icons inline | 04-webui |
| **6.8 — Sample app** | | | [`findings/05-sample.md`](findings/05-sample.md) |
| 6.8.1 | Module installs on emulator + device | 🟡 unverified — requires runtime (gradle module valid) | 05-sample |
| 6.8.2 | Four GET buttons present | ✅ pass | 05-sample |
| 6.8.3 | Failing-host URL unreachable (RFC 2606 `.invalid`) | ✅ pass | 05-sample |
| 6.8.4 | Five log buttons (one per level) | ✅ pass | 05-sample |
| 6.8.5 | ERROR throwable chain | ✅ pass — 2-deep `RuntimeException` → `IllegalStateException` | 05-sample |
| 6.8.6 | UI displays Argus URL | ✅ pass | 05-sample |
| 6.8.7 | Logcat `Argus listening on http://...` | ✅ pass — `Log.i("Argus", "Argus listening on $bound")` | 05-sample |
| 6.8.8 | Release variant: zero Argus imports | ✅ pass — also enforced by `verifyReleaseHasNoArgus` task | 05-sample |
| 6.8.9 | Release variant has functional buttons (seam doesn't leak) | ✅ pass | 05-sample |
| **6.9 — Documentation** | | | [`findings/06-docs-quality.md`](findings/06-docs-quality.md) |
| 6.9.1 | `README.md` exists | ✅ pass | 06-docs-quality |
| 6.9.2 | Prominent debug-only warning | ✅ pass — GFM `[!WARNING]` callout | 06-docs-quality |
| 6.9.3 | Code samples reference real types | ⚠️ partial — types real but iOS Step 3 snippet won't compile against the real `DebugTools` interface | 06-docs-quality |
| 6.9.4 | Code samples match `:sample` | ❌ **fail** — README claims "verbatim" but silently strips four Phase 3 methods (`publishCustom`, `fireOkHttpCall`, `fireUrlConnectionCall`, `fireCorrelatedPair`) from the interface and impls | 06-docs-quality |
| 6.9.5 | Troubleshooting covers three scenarios | ✅ pass | 06-docs-quality |
| 6.9.6 | Configuration reference covers all `ArgusConfig` options | ❌ **fail** — README §9 omits `persist`, `persistMaxSizeMb`, `persistMaxAgeDays` (server-side) and `fullBodyHosts`, `captureRequestBody`, `captureResponseBody` (client-side plugin) | 06-docs-quality |
| **6.10 — Code quality** | | | [`findings/06-docs-quality.md`](findings/06-docs-quality.md) |
| 6.10.1 | No TODO/FIXME/HACK in shipped code | ✅ pass | 06-docs-quality |
| 6.10.2 | Public API has KDoc | ⚠️ partial — server-side good; `Argus.start()` (Android entry), `Argus` Ktor plugin val, `ArgusHandle.{url,eventBus,stop}`, and `Argus`/`ArgusHandle` on iOS lack KDoc | 06-docs-quality, 08-phase34 |
| 6.10.3 | No unused imports / commented-out code | ✅ pass (heuristic) | 06-docs-quality |
| 6.10.4 | Module-level README or KDoc package docs | ❌ **fail** — no per-module READMEs or package KDoc files; only the root README §11 module table | 06-docs-quality |
| 6.10.5 | Test coverage of named slices | ⚠️ partial — `:argus-core/commonTest` ✓; `:argus-server-core` routing tests live in `jvmTest` (spec wants `commonTest`); `:argus-android` and `:argus-ios` have no `ArgusServer.start()`/`stop()` smoke tests | 06-docs-quality, 08-phase34 |
| 6.10.6 | No reflection in capture paths | ✅ pass (only `this::class.simpleName` for naming) | 06-docs-quality |
| 6.10.7 | No platform code in `commonMain` | ✅ pass | 06-docs-quality |
| 6.10.8 | No `runBlocking` in production | ✅ pass (test-only) | 06-docs-quality |
| **6.11 — Performance** | | | static-only |
| 6.11.1 | Ktor plugin < 2 ms p99 over `MockEngine` | 🟡 unverified — requires runtime (`ArgusClientPluginLatencyTest` exists in `jvmTest`) | 02-capture |
| 6.11.2 | Logger publish < 1 ms for 1 KB message | 🟡 unverified — requires runtime | 02-capture |
| 6.11.3 | Server cold-start < 500 ms | 🟡 unverified — requires runtime | 03-server |
| **6.12 — Security and privacy** | | | [`findings/07-security.md`](findings/07-security.md) |
| 6.12.1 | Default redacted headers, case-insensitive | ✅ pass | 07-security |
| 6.12.2 | Adding custom header to `redactHeaders` works | ✅ pass | 07-security |
| 6.12.3 | No sensitive data with default redaction | ✅ pass — redaction at capture time, not UI-side | 07-security |
| 6.12.4 | No data sent to external services | ✅ pass — egress scan clean | 07-security |
| 6.12.5 | README documents LAN-exposure risk | ✅ pass | 07-security |

**Counts:** 53 ✅ pass, 8 ⚠️ partial / deviation, 4 ❌ fail, 9 🟡 unverified — requires runtime.

---

## Critical defects (sorted by severity)

### 1. `:argus-urlconnection` drops captured response body on `disconnect()`-before-`close()` path

**Severity: high (correctness bug).** `ArgusHttpURLConnection.kt:196-205` `emitIfNeeded()` ships an event with an empty `ByteArray(0)` body even when the tee captured data — the `if (tee != null)` and `else` branches are identical. Latent only because every existing test closes the stream via `use { }` first. Fix: read the captured prefix from `TeeInputStream` before publishing, and add a regression test that asserts a full body capture after `disconnect()` without `close()`. (See `findings/08-phase34.md` "Streaming safety" subsection.)

### 2. `Dispatchers.IO` used without `kotlinx.coroutines.IO` import will break Kotlin/Native iOS build

**Severity: high (build breaker on iOS).** `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/buffer/EventRingBuffer.kt:147,153` calls `scope.launch(Dispatchers.IO)` but only imports `kotlinx.coroutines.Dispatchers` (line 10). Per the user's K/N gotcha note: iOS Native targets need the explicit `import kotlinx.coroutines.IO` for `Dispatchers.IO` to resolve. The `:argus-ios` module itself has the import correctly (`Argus.kt:13`); the bug is in `:argus-server-core/commonMain`. (See `findings/08-phase34.md` "Dispatchers.IO smell" subsection.)

### 3. README §9 Configuration reference is incomplete

**Severity: medium (spec violation §6.9.6).** Six public config knobs are undocumented:
- Server-side `ArgusConfig` (consumed by `Argus.start()`): `persist`, `persistMaxSizeMb`, `persistMaxAgeDays`.
- Client-side `ArgusClientConfig` (consumed by `install(ArgusPlugin)`): `fullBodyHosts`, `captureRequestBody`, `captureResponseBody`.

The README also doesn't distinguish server-side from client-side configuration. (See `findings/06-docs-quality.md` "ArgusConfig reference completeness".)

### 4. README "verbatim from `:sample`" claim is false

**Severity: medium (spec violation §6.9.4).** The README opens §4 and §5 with "Every code block below is copied verbatim from `:sample`" but silently strips four Phase 3 methods from the `DebugTools` interface and both implementations. A new developer following only the README will end up with code that doesn't satisfy the real interface used in `:sample`. Fix: either add an explicit "Phase 3 demo methods omitted; see `:sample`" callout, or split the Phase 1 minimal sample from the Phase 3 demo sample. (See `findings/06-docs-quality.md` "Code samples vs sample app diff".)

### 5. `docs/design/` artifacts not at canonical path

**Severity: medium (spec violation §6.6.1).** `docs/design/` does not exist. Design artifacts are scattered: 4 mockup PNGs in `docs/ui/`; JSX prototypes + CSS tokens in `design_handoff_argus_inspector/`; runtime tokens in `argus-webui/src/design/tokens.json`. No `interactions.md`, no per-component spec markdown, no design-system overview. The token pipeline (CSS → `tokens.json` → Tailwind) is solid, so the implementation is well-grounded; the contractual artifact layout just doesn't match. Fix: create `docs/design/` with the missing markdown specs, or update the spec to reference the actual locations. (See `findings/04-webui.md` "docs/design/ inventory".)

### 6. `:argus-android` and `:argus-ios` lack `ArgusServer.start()`/`stop()` smoke tests

**Severity: medium (spec violation §6.10.5).** `:argus-android/src/androidUnitTest/` only contains `AppInfoBuilderTest` and `ArgusConfigBuilderTest`. `:argus-ios/src/iosTest/` only contains `AppInfoBuilderTest` (4-line assertion). No end-to-end smoke test for the Android facade or iOS entry point. Add a test that calls `Argus.start()`, asserts `boundPort > 0` (or `url` becomes non-null on iOS), then `stop()` cleanly.

### 7. Server routing tests live in `jvmTest`, not `commonTest`

**Severity: low (spec violation §6.10.5; functionally fine).** `argus-server-core/src/jvmTest/.../{RoutesTest,WsTest}.kt` exercise the routes via Ktor's `testApplication`. Spec wants these in `commonTest`. They're functionally equivalent (`testApplication` runs on JVM regardless), but iOS-targeting CI runs won't execute them. Move to `commonTest` if Ktor's test-host is multiplatform-available in the project's Ktor version.

### 8. UI deviations from spec §5.7

**Severity: medium (forbidden features partially present).**

- **"Load full body" button** in `BodyViewer.ts:64-76` — §5.7 forbids "Full-body download for truncated bodies". Currently dead-wired (no caller passes `onLoadFull`), but the visible button suggests the feature exists. Fix: remove the button or rename the truncation banner.
- **Phased waterfall stand-in** — `Waterfall.ts:328-337` and `EventDetail/tabs/HttpTabs.ts:148-167` Timing tab render hardcoded 3-segment bars (Connect 15% / Wait 55% / Download 30%) using fixed weights, not real phase data. §5.7 forbids "Phased waterfall (DNS / Connect / TLS / Send / Wait / Receive breakdown)". Fix: render a single status-tinted bar per request, or label the segments as illustrative.
- **Keyboard `x` divergence** — spec §5.6 says `x` is "clear with confirm". Impl maps `x → clearFilters`, `Shift+X → clearEvents` with toast + ⌘Z undo (no confirm modal). Likely intentional UX upgrade; needs spec update or impl change.

### 9. Stale references and orphan strings

**Severity: low (doc drift, not functional).**

- `README.md` §11 module table omits `:argus-ios`, `:argus-okhttp`, `:argus-urlconnection`.
- Spec text references `:sample-android` (the unified module is now `:sample`) — multiple sites in `argus-audit-spec.md` §3.1, §4, §5.8, §6.3, §6.8.
- `sample/src/androidRelease/.../DebugToolsImpl.kt:2` invariant comment references `:sample-android:verifyReleaseHasNoArgus` — task is now `:sample:verifyReleaseHasNoArgus`.
- `design_handoff_argus_inspector/README.md:60` lists older HTTP detail tab names (`Overview · Headers · Request · Response · Timing · cURL`) than the spec/impl (`Headers · Request · Response · Timing · Related Logs · Raw`).
- `agent-os/product/mission.md` still mentions mDNS via `:lantern-android`, dropped per spec §3.8.

---

## Risk register

Architectural drift, hidden coupling, and future-maintenance concerns observed during review.

| # | Risk | Source |
|---|------|--------|
| R1 | **`ArgusServer` is not `expect/actual`.** Single class in `commonMain` because Ktor CIO is multiplatform. Functionally simpler than the spec's design (less platform code, no per-target binding shim) but the contract drifted. Recommend updating spec §3.3 / §6.1.3 to acknowledge the deliberate decision. | 01-architecture, 03-server, 08-phase34 |
| R2 | **CORS gating is config-driven, not build-type-driven.** A release-mode misconfigured client could keep the default `localhost:5173` allowance. Loopback makes this safe in practice, but consider documenting or defaulting to `emptyList()` in release. | 03-server, 07-security |
| R3 | **No-auth on the bound port (per spec §5.4).** Anyone on the LAN can read everything. Mitigations: `debugImplementation`-only seam, `verifyReleaseHasNoArgus` CI gate, README LAN warning. Reviewers should confirm consumer apps surface the warning. | 07-security |
| R4 | **Capture buffer uses `ArrayList<Byte>`.** `BodyCapture.kt:18,27` builds the captured prefix per-byte with auto-boxing. For caps near `Int.MAX_VALUE` or `fullBodyHosts` use, this is a memory hot spot; replace with `kotlinx-io Buffer` equivalent. | 02-capture |
| R5 | **`fullBodyHosts` silently caps at ~2.1 GB.** `drainWithCap` clamps to `Int.MAX_VALUE`; `fullBodyHosts` advertises `Long.MAX_VALUE`. Document or fix. | 02-capture |
| R6 | **Streaming request bodies are not teed in the Ktor plugin.** Non-`ByteArrayContent` `OutgoingContent` produces a metadata-only `CapturedBody`. Acceptable design (avoids consuming a write channel) but means `bodyPreview` is null for `ChannelWriterContent` uploads. Document the asymmetry: response bodies are tee'd, request bodies are not. | 02-capture |
| R7 | **`:argus-okhttp` buffers entire request body before send.** `body.writeTo(buffer)` materializes the full payload in memory regardless of `effectiveMax`. A 200 MB upload with a 1 MB cap costs 200 MB transient heap. Document the memory ceiling. | 08-phase34 |
| R8 | **`Argus.start()` swallows server-start failures on iOS.** Exception inside `argus-ios/.../Argus.kt:35` launched coroutine is consumed by `SupervisorJob`; `handle.url` stays `null` forever with no surfaced error. Surface the failure (e.g. via a `StateFlow<StartupError?>` or by failing the handle's `url` flow). | 08-phase34 |
| R9 | **Snapshot allocation per write in ring buffer.** `EventRingBuffer.kt:120` `_snapshot.value = events.toList()` allocates a full copy on every published event — at sustained 500/s this is 500 list copies/sec of up to `maxEvents` elements. Material for §6.5.3 verification work. | 03-server |
| R10 | **No XCFramework for non-KMP iOS consumers.** `:argus-ios` ships per-target static frameworks. Swift-only Xcode projects without KMP can't consume the artifact directly. Acceptable for v1 if all consumers are KMP; document the limitation. | 08-phase34 |
| R11 | **Throwable class fidelity.** Capture uses `this::class.simpleName ?: this::class.toString()` (no FQN). Two app classes sharing a `simpleName` are indistinguishable in the captured stream. Minor; FQN would need an `expect/actual` because `qualifiedName` is JVM-only. | 02-capture |
| R12 | **WS `subscribe` is fire-and-forget, no ack.** Client never learns its filter was rejected. Consistent with spec ("optional"), but worth noting. | 03-server |
| R13 | **Lint exemption hides sub-token sizes.** `globals.css` carries `9px`/`10px` raw values for `.ds-kbd` / `.ds-src-badge` and four `text-[10px]` arbitrary Tailwind classes. They're inside the lint-exempt zone but aren't driven by tokens. Add `fontSize.xxs` to `tokens.json` to close the loophole. | 04-webui |
| R14 | **Phase 3 / Phase 4 modules ship in MVP.** Per user decision (in-scope, not drift), but spec §7 lists them as deferred. Updating spec §7 to declare them shipped (or moving them to MVP) would close the conceptual gap. | 08-phase34 |
| R15 | **Sample minSdk pinned to 34** for D8/Ktor 3.2.x context-parameter SimpleNames issue. Library `:argus-core` still supports minSdk 24. Track the upstream fix and revert when available. | 05-sample |

---

## Performance status (unverified items)

All performance items remain `unverified — requires runtime` per the audit-depth setting. To close them out:

| § | Item | What to run |
|---|------|-------------|
| 6.3.5 | `assembleRelease` succeeds | `./gradlew :sample:assembleRelease` |
| 6.3.6 | No `com.lynxal.argus.*` in release dex | `./gradlew :sample:verifyReleaseHasNoArgus` (the project's own task is stricter than `apkanalyzer dex packages`) |
| 6.5.3 | 500 req/s + 500 log/s sustained, no drops | Run `argus-server-core/src/jvmTest/.../LoadTest.kt`; runtime smoke on a Pixel-6-class device |
| 6.7.1 | Bundle < 100 KB gzipped (final ruling on font budget) | Decide whether self-hosted woff2 fonts (~162 KB raw) count against the 100 KB envelope; if yes, subset the font set or move to system fonts |
| 6.7.2 | Lighthouse > 95 in light & dark | `npm run lighthouse` (script defined in `argus-webui/package.json:16`) against `localhost:4173` |
| 6.7.3 | 10k event scroll, no dropped frames | Chrome DevTools performance recording with seeded ring buffer |
| 6.7.4 | Waterfall 1 000 events < 100 ms | Measure via `argus-webui/src/dev/perf.ts` harness |
| 6.7.6 | Body search highlight < 50 ms across 500 events | Same harness |
| 6.11.1 | Ktor plugin < 2 ms p99 over `MockEngine` | Run `argus-core/src/jvmTest/.../ArgusClientPluginLatencyTest.kt` |
| 6.11.2 | Logger publish < 1 ms for 1 KB message | Add benchmark; not currently scaffolded |
| 6.11.3 | Server cold-start < 500 ms on mid-tier device | Add benchmark; not currently scaffolded |

---

## Security findings summary

Detailed analysis in [`findings/07-security.md`](findings/07-security.md). All §6.12 items pass on static review; the items below are top-of-list issues to address.

1. **No auth on the bound port (per spec §5.4).** **High** — by-design risk; mitigated by README warning + `debugImplementation`-only + `verifyReleaseHasNoArgus`. No code change required by spec; consumers should surface the LAN warning in their own onboarding.
2. **Vite 5.4.10 dev-server CVEs (CVE-2025-30208, -31125, -31486, -32395, -46565).** **Moderate (dev-only).** Bump to `vite@5.4.18+` or `vite@6`. Same with `esbuild@0.21.5` (transitive via vite) and `esbuild@0.23.1` (direct via tsx/vitest) — bump to `esbuild@0.25+`. None affect the on-device artifact.
3. **Body content not redacted, only headers (per spec §3.7).** **Informational.** Secrets in JSON request/response bodies are captured verbatim. The README's LAN warning covers this implicitly; consider a one-line addition: "header redaction does not extend to request/response bodies".
4. **First-party `com.lynxal.logging:logging@0.0.6`.** **Informational.** Out of standard CVE feed visibility; recommend Lynxal's internal review covers it explicitly since version pinning is in audit scope.
5. **Items needing online CVE check.** Ktor 3.2.0, kotlinx-serialization 1.8.0, kotlinx-coroutines 1.10.2, OkHttp 4.12.0, AGP 8.11.0, SqlDelight 2.0.2, vitest 2.1.4, rollup 4.60.2, tailwindcss 3.4.14, autoprefixer 10.4.20, tsx 4.19.0, @preact/signals-core 1.8.0. Run `osv-scanner` or check the GitHub Advisory database.

**Secret scan:** clean — no real secrets, no private keys, no AWS/GCP/Slack/GitHub tokens, no committed `.env` files. Eight matches total, all are test fixtures or documentation strings.

**Egress scan:** clean — only matches are loopback/listening URLs and an `xmlns` namespace literal. No analytics, no telemetry, no remote config, no CDN, no fonts/icons fetched at runtime.

**Path traversal:** design-immune — static asset serving uses a `Map<String, BundleEntry>` lookup, not filesystem resolution.

**Input validation:** every `/api/events` filter parameter is parsed safely (`toIntOrNull`, `runCatching { Enum.valueOf(...) }`, string equality / `contains`). No SQL is constructed from user input.

---

## Phase 3 / Phase 4 module status

Detailed analysis in [`findings/08-phase34.md`](findings/08-phase34.md). User decision: in-scope, audited as first-class.

| Module | Verdict | Reason |
|--------|---------|--------|
| `:argus-okhttp` | **ready** | Full field-parity with the Ktor plugin via shared `buildRedactedHeaders` helper; streaming-safe via OkHttp's `peekBody`; explicit one-shot handling; six tests against `MockWebServer`. Two minor follow-ups: README mention of the chunked-encoding `truncatedTotalBytes = null` limitation (already in KDoc), and the request-body buffering memory cost (R7). |
| `:argus-urlconnection` | **needs work** | Latent correctness bug (Critical Defect #1): `emitIfNeeded()` discards captured tee bytes when `disconnect()` fires before the response stream is closed, shipping an empty-body event. Fix and add a regression test. |
| `:argus-ios` | **needs work** | (a) No smoke test for `Argus.start()`/`stop()`. (b) `Argus.start` swallows server-start failures inside its launched coroutine — surface them. (c) No KDoc on `Argus` object or `ArgusHandle`. (d) Update spec §3.3 to acknowledge the deliberate decision to keep `ArgusServer` in `commonMain`. (e) Latent K/N build risk in `:argus-server-core/EventRingBuffer.kt` (Critical Defect #2 — outside this slice but will surface here). |

Engine parity table in `findings/08-phase34.md` confirms all three engines emit consistent `HttpEvent` shapes with proper engine discrimination (`"ktor"` / `"okhttp"` / `"urlconnection"`).

---

## Recommendation

**Ship with corrections.**

The MVP is functionally complete, secure, and well-engineered. The recommended remediation list, ordered by urgency:

1. **Fix `:argus-urlconnection` `emitIfNeeded()` body discard** (Critical Defect #1).
2. **Add `import kotlinx.coroutines.IO` to `:argus-server-core/EventRingBuffer.kt`** (Critical Defect #2).
3. **Reconcile `docs/design/` artifact location** — either populate the canonical path with markdown specs (`interactions.md`, per-component specs, design system overview), or amend spec §3.9 to point at the existing handoff bundle.
4. **Update README §9 Configuration reference** to cover all six missing knobs and split server-side vs client-side configuration.
5. **Reconcile README "verbatim from `:sample`" claim** — add explicit Phase 3 omission callouts or split sample into Phase 1 minimal vs Phase 3 demo.
6. **Add KDoc on the high-traffic public API** — `Argus.start()` (Android + iOS), `Argus` Ktor plugin val, `ArgusHandle.{url,eventBus,stop}`, and `ArgusClientConfig` properties.
7. **Add `ArgusServer.start()`/`stop()` smoke tests** to `:argus-android/androidUnitTest/` and `:argus-ios/iosTest/`.
8. **Move server routing tests** from `:argus-server-core/jvmTest/` to `commonTest/` (if Ktor's `testApplication` is multiplatform in the project's Ktor version).
9. **Resolve UI deviations** — remove or rename the "Load full body" button in `BodyViewer`, replace the hardcoded 3-segment phased waterfall with a single tinted bar, and decide whether the keyboard `x`-divergence reflects an intentional UX upgrade (update spec) or should be reverted to the spec wording.
10. **Bump dev-only npm tooling** — `vite@5.4.18+` or `vite@6`; `esbuild@0.25+`.
11. **Update spec §3.3 / §6.1.3** to acknowledge the deliberate `ArgusServer`-in-`commonMain` decision (eliminate the `expect/actual` requirement).
12. **Update spec to reference the unified `:sample` module** in §3.1 / §4 / §5.8 / §6.3 / §6.8 (currently says `:sample-android`).
13. **Add `:argus-ios`, `:argus-okhttp`, `:argus-urlconnection` to README §11** module table.
14. **Optionally:** add module-level READMEs (per §6.10.4); add `fontSize.xxs` to `tokens.json` to absorb the `9px`/`10px` sub-token sizes (R13); consider per-host CORS gating to release builds only (R2).

Once items 1, 2, and 4–9 are addressed, the audit verdict moves to ship-clean.

---

## Per-area findings index

- [`findings/01-architecture.md`](findings/01-architecture.md) — §6.1 + §6.3
- [`findings/02-capture.md`](findings/02-capture.md) — §6.2
- [`findings/03-server.md`](findings/03-server.md) — §6.4 + §6.5
- [`findings/04-webui.md`](findings/04-webui.md) — §6.6 + §6.7
- [`findings/05-sample.md`](findings/05-sample.md) — §6.8
- [`findings/06-docs-quality.md`](findings/06-docs-quality.md) — §6.9 + §6.10
- [`findings/07-security.md`](findings/07-security.md) — §6.12 + dependency CVEs + secret scan
- [`findings/08-phase34.md`](findings/08-phase34.md) — `:argus-okhttp` + `:argus-urlconnection` + `:argus-ios`
