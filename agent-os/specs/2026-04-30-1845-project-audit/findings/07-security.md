# Security Audit (§6.12 + dependency CVEs + secret scan)

Slice: Security. Scope: §6.12 (security and privacy), §3.7 (transparent body redaction),
§5.4 (CORS / no-auth + LAN exposure documentation).

---

## §6.12 Code review

| # | Item | Severity | Status | Evidence |
|---|------|----------|--------|----------|
| 6.12.1 | Default redacted headers present and case-insensitive | Critical | Pass | `argus-core/.../capture/CaptureDefaults.kt:6-11` (set), `capture/HeaderRedaction.kt:10-12` (case-insensitive via `lowercase()` on both sides) |
| 6.12.1b | Redaction symmetric (request + response) | High | Pass | Ktor: `argus-core/.../ktor/ArgusClientPlugin.kt:49` (req), `:149` (resp). OkHttp: `argus-okhttp/.../ArgusOkHttpInterceptor.kt:155` (req), `:76` (resp). HttpURLConnection: `argus-urlconnection/.../ArgusHttpURLConnection.kt:315` (req), `:326` (resp) |
| 6.12.2 | Adding a custom header to `redactHeaders` works | Medium | Pass | `redactHeaders` is a public `Set<String>` on every config (`argus-core/.../ktor/ArgusClientConfig.kt:10`, `argus-okhttp/.../ArgusOkHttpConfig.kt:7`, `argus-server-core/.../ArgusConfigBuilder.kt:16`). Caller-supplied set flows through `buildRedactedHeaders` unchanged; case-insensitive match means callers can pass any casing. Test: `argus-core/.../ArgusClientPluginTest.kt:190-219` |
| 6.12.3 | Redaction applied before events reach the bus (not just UI) | Critical | Pass | `ArgusClientPlugin.kt:49` builds redacted headers in `onRequest`, then stashes the snapshot (`:61-71`); bus receives only redacted snapshot via `emitSuccess` at `:160-171`. `Header.value` is replaced with `***redacted***` (`HeaderRedaction.kt:13-17`), and the on-disk SQLite store serializes the same redacted `Header` model (`Header.kt:9` carries `redacted: Boolean = false`). UI never sees raw values. |
| 6.12.4 | No data sent to any external service from the device | Critical | Pass | Egress scan covered all `:argus-*` modules; only matches are (a) the ConfigBuilder default `"http://localhost:5173"` for CORS dev origin (`ArgusConfigBuilder.kt:17`, `ArgusConfig.kt:32`), (b) the printed listening URL `http://$ip:port` (`ArgusHandle.kt:23`, `argus-ios/.../ArgusHandle.kt:23`), (c) a `127.0.0.1:1` unreachable test target (`argus-urlconnection/.../ArgusHttpURLConnectionTest.kt:197`), and (d) the `xmlns:android` namespace literal in `AndroidManifest.xml`. No analytics, no telemetry, no remote URL fetch. |
| 6.12.5 | README documents LAN-exposure risk and recommends not running on untrusted networks | High | Pass | `README.md:27-32` callout block: "any device on the same network can read tokens, PII, and internal traffic"; `README.md:506` "the embedded server is a production-grade attack surface"; `README.md:512` recommends dedicated dev network or `adb reverse` over USB. |

### Header redaction analysis

- **Implementation**: `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/HeaderRedaction.kt` is the single chokepoint. It lowercases the user-supplied set once, then matches each header name's lowercase form. Ascii-safe; works with arbitrary casing (`Authorization`, `authorization`, `AUTHORIZATION`).
- **Default set** (`CaptureDefaults.kt:6-11`): `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization` — exactly the §3.7 list.
- **Placeholder**: `***redacted***` (`CaptureDefaults.kt:13`); written into `Header.value` and the `redacted: Boolean` flag is set so the UI can style.
- **Symmetry**: All three engine modules (Ktor, OkHttp, HttpURLConnection) call `buildRedactedHeaders` for both request and response — verified above.
- **Body redaction**: Not implemented (and not required by spec — §3.7 limits redaction to headers). Bodies are captured up to `maxBodyBytes` then truncated. Note: a developer who sends secrets in JSON request/response bodies will see them in the inspector. Document trade-off — see "Other findings" below.

### CORS posture

- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/InstallArgusRoutes.kt:34-47` only installs CORS when `corsOrigins` is non-empty.
- Each origin is parsed into scheme + host:port and registered via `allowHost(...)`. **No `anyHost()`, no `allowSameOrigin()`, no `allowCredentials = true`.** Verified by grep — no other CORS-related calls anywhere in the codebase.
- Default origin list in builder: `listOf("http://localhost:5173")` (`ArgusConfigBuilder.kt:17`). Spec §5.4 compliant.
- `allowMethod(Delete)` and `allowHeader(ContentType)` are added (line 44-45). Other methods (GET, OPTIONS) are simple/CORS-safelisted by Ktor defaults.
- **Posture**: Correct — wildcard origin not used; consumers can disable CORS entirely by passing an empty list at config time.

### Input validation per server route

`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Events.kt`

| Param | Source | Parser | Notes |
|-------|--------|--------|-------|
| `limit` | `Events.kt:21` | `toIntOrNull()?.coerceAtLeast(0)` | Non-int → null (filter skipped); negative → clamped to 0. Safe. |
| `before` | `Events.kt:22` | raw String → `indexOfFirst { it.id == before }` | String equality only; no FS or SQL. Safe. |
| `source` | `EventFilter.kt:64-66` | `EventSource.valueOf(...)` wrapped in `runCatching` | Invalid enum → null → filter skipped. Safe. |
| `method` | `EventFilter.kt:67` | raw String, compared via `equals(ignoreCase = true)` | No injection vector. Safe. |
| `statusClass` | `EventFilter.kt:68` | `toIntOrNull()?.takeIf { it in 1..5 }` | Out-of-range → null → filter skipped. Safe. |
| `host` | `EventFilter.kt:69` | raw String, `equals(host, ignoreCase = true)` against `event.request.host` | Pure string compare, no FS. No path-traversal vector. Safe. |
| `urlContains` | `EventFilter.kt:70` | raw String, `String.contains(..., ignoreCase = true)` | Substring check only. Safe. |
| `logLevel` | `EventFilter.kt:71` | `LogLevel.valueOf(...)` in `runCatching` | Invalid → non-match. Safe. |
| `tag` | `EventFilter.kt:72` | raw String, `event.tag != tag` | Pure equality. Safe. |
| `id` (path) | `Events.kt:38, 45, 54` | raw String, `firstOrNull { it.id == id }` | Pure equality, no FS. Safe. |

No SQL is constructed from these parameters at any point — the in-memory ring buffer is iterated in plain Kotlin, and the SqlDelight persistence layer (`argus-core/.../persistence/SqlDelightEventStore.kt`) only reads/writes by parameterized `sessionId`, never by user input.

### Egress check (no external network calls)

Comprehensive grep across `argus-core`, `argus-server-core`, `argus-android`, `argus-ios`, `argus-okhttp`, `argus-urlconnection` for `http://`, `https://`, `ws://`, `wss://`:

- `ArgusConfigBuilder.kt:17` — `"http://localhost:5173"` (Vite dev server CORS allow-list, loopback only).
- `ArgusConfig.kt:32` — same default.
- `InstallArgusRoutes.kt:38-39` — string-prefix check on user-supplied `corsOrigins` entries.
- `argus-android/.../ArgusHandle.kt:23` — `"http://$ip:port"` constructed for the listening-URL log line (no outbound call).
- `argus-android/src/androidMain/AndroidManifest.xml:2` — `xmlns:android` namespace URI (constant, not a network call).
- `argus-ios/.../ArgusHandle.kt:23` — same listening-URL string as Android.
- `argus-urlconnection/.../ArgusHttpURLConnectionTest.kt:197` — `"http://127.0.0.1:1"` (test fixture, unreachable address).

**No analytics, no crash reporting, no remote config, no CDN, no fonts/icons fetched at runtime.** §6.12.4 passes.

### LAN-exposure documentation in README

- Prominent `> [!WARNING]` callout at `README.md:27-32` — opens with the debug-only mandate and explicitly enumerates the LAN risk: tokens, PII, internal traffic readable by anyone on the same network.
- Reinforced at `README.md:506` ("production-grade attack surface") and at `README.md:12`.
- `README.md:512` advises "dedicated dev network, a personal hotspot, or `adb reverse tcp:8787 tcp:8787` over USB" — this is the recommended-mitigation language §6.12.5 looks for.

§6.12.5 passes.

### Other findings (input validation, traversal, error leakage)

- **Static asset traversal**: `argus-server-core/.../routes/Ui.kt:21-35` resolves `/{path...}` against `ArgusUiBundle.get(raw)` (`argus-webui-bundle/.../ArgusUiBundle.kt:13-25`). The bundle is a `Map<String, BundleEntry>` keyed by canonical paths emitted at build time. Even if a request arrives as `/../etc/passwd` or `/%2e%2e/foo`, the lookup is a pure map `get()` — no filesystem touch. Path-traversal vector: **not present**. (Severity: N/A — design-immune.)
- **`/api/*` and `/ws/*` shadowing guard**: `Ui.kt:25-28` returns 404 for these prefixes rather than falling back to `index.html` — prevents leaking the SPA shell when API routes 404.
- **Ktor StatusPages / dev mode**: No `install(StatusPages)` and no `developmentMode = true` anywhere in source. Ktor 3.x defaults to production-mode error responses (generic 500, no stack trace in body). **No stack traces leak via REST.** Note: stack traces *do* appear inside captured `HttpEvent.error.stackTrace` (`argus-core/.../HttpError.kt`) and in `LogEvent` payloads — that's the inspector's purpose, not a leak. Reviewer should note the inspector itself, by design, displays the inspected app's stack traces; this is content the inspector *captures*, not content the inspector's server *exposes from itself*.
- **WebSocket close on lag** (`Ws.kt:53`): closes the socket with `INTERNAL_ERROR` and the message `"lagging"`. Not a stack leak; informational reason code.
- **Body capture**: `maxBodyBytes` enforced; `fullBodyHosts` opt-in disables the cap per host. Per `ArgusClientConfig.kt:18-21` doc, this is held in memory for the capture lifetime — documented foot-gun, not a security finding.
- **Absence of body redaction** (note, not a finding): Spec §3.7 limits redaction to headers. Bodies that contain secrets (e.g. `{"password":"…"}`, OAuth token JSON) are captured verbatim. This is consistent with the spec but is worth flagging in the risk register so consumers know that *the LAN warning is the mitigation*, not a body sanitizer. Severity: Informational.
- **Auth on the server**: None. Anyone who reaches the LAN port reads everything. Spec §5.4 explicitly says "Auth: none in v1." Mitigated only by the README warning + `debugImplementation`-only CI gate. Severity: High by design.

---

## Dependency CVEs (static)

Resolved versions read from `/Users/vardan.kurkchiyan/AndroidStudioProjects/argus/gradle/libs.versions.toml`,
`/Users/vardan.kurkchiyan/AndroidStudioProjects/argus/argus-webui/package.json`, and the lockfile at
`/Users/vardan.kurkchiyan/AndroidStudioProjects/argus/argus-webui/package-lock.json`.

### Kotlin / JVM ecosystem

| Dep | Version | CVE | Severity | Fixed in | Notes |
|-----|---------|-----|----------|----------|-------|
| Ktor (server + client) | 3.2.0 | requires online check | n/a | n/a | No CVE I can confidently recall against 3.2.0; Ktor 3.x line is current. The 2.3.x line had CVE-2024-49580 (CIO denial-of-service). 3.2.0 is post-fix. |
| kotlinx-serialization-json | 1.8.0 | requires online check | n/a | n/a | No CVE I can recall. Current line. |
| kotlinx-coroutines-core | 1.10.2 | requires online check | n/a | n/a | Current. No CVEs I can confidently recall. |
| Kotlin stdlib | 2.2.0 | requires online check | n/a | n/a | Current. No known CVE recall. |
| OkHttp | 4.12.0 | requires online check | n/a | n/a | 4.12.0 is the current 4.x. CVE-2023-3635 (`okio` GZIP) was fixed before 4.12.0. CVE-2021-0341 (hostname verification) was 3.x and earlier. No 4.12.0-specific CVE I can recall. |
| AGP (com.android.tools.build:gradle) | 8.11.0 | requires online check | n/a | n/a | n/a — build-time only. |
| SqlDelight | 2.0.2 | requires online check | n/a | n/a | n/a — no recall. |
| Robolectric | 4.12.2 | requires online check | n/a | n/a | Test-only. |
| KMMLogging (`com.lynxal.logging:logging`) | 0.0.6 | requires online check | n/a | n/a | First-party (Lynxal) library — out of standard CVE feeds. |

### npm / Web UI

| Dep | Version | CVE | Severity | Fixed in | Notes |
|-----|---------|-----|----------|----------|-------|
| vite | 5.4.10 | **CVE-2025-30208**, CVE-2025-31125, CVE-2025-31486, CVE-2025-32395, CVE-2025-46565 | Moderate–High | 5.4.12, 5.4.14, 5.4.15, 5.4.18 | Vite 5.4.x had a series of `server.fs.deny` bypasses across early-2025. **Dev-server only — does not affect built bundle / runtime.** Argus only uses Vite for `npm run dev`/`build`; the *production* path is a static byte-array bundle. Risk to a developer running `npm run dev` against a hostile network. **Recommend bump to 5.4.18+ or 6.x.** |
| esbuild | 0.21.5 (transitive via vite), 0.23.1 (direct via tsx/vitest) | CVE-2024-… `serve` CORS bypass on dev server | Moderate | 0.25.0+ | Same dev-only footprint. Bump alongside vite. |
| postcss | 8.4.47 | CVE-2023-44270 was fixed in 8.4.31; 8.4.47 is post-fix | None recalled at 8.4.47 | — | Looks clean. |
| tailwindcss | 3.4.14 | requires online check | n/a | n/a | None recalled. |
| autoprefixer | 10.4.20 | requires online check | n/a | n/a | None recalled. |
| typescript | 5.5.4 | n/a | n/a | n/a | Compiler; no runtime CVE relevant. |
| tsx | 4.19.0 | requires online check | n/a | n/a | Build/test only. |
| vitest | 2.1.4 | requires online check | n/a | n/a | Test-only. The vitest 2.x line had a CVE around the test runner exposing the host (`vitest-related browser endpoints`) in some 2.x versions; recommend confirming 2.1.4 is on the safe side. **`requires online check`.** |
| rollup | 4.60.2 | requires online check | n/a | n/a | Build-time only. |
| nanoid | 3.3.11 | n/a | n/a | n/a | 3.3.8+ post-fix for CVE-2024-55565 (predictable IDs in non-integer length). 3.3.11 is post-fix. |
| micromatch | 4.0.8 | n/a | n/a | n/a | CVE-2024-4067 (regex-DoS) fixed in 4.0.8. Clean. |
| @types/node | 20.14.0 | n/a | n/a | n/a | Type-defs; no runtime. |
| @preact/signals-core | 1.8.0 | requires online check | n/a | n/a | Only runtime npm dep. None recalled. |

**Bottom line for npm**: every flagged item is a **dev/build-only** dependency. The shipped artifact is a static byte-array bundle generated once by `:argus-webui-bundle` and embedded; runtime users do not pull node code. Bumping `vite` and `esbuild` to current patch levels is a hygiene win but doesn't change the on-device security posture.

Items marked `requires online check`: Ktor 3.2.0, kotlinx-serialization 1.8.0, kotlinx-coroutines 1.10.2, OkHttp 4.12.0, AGP 8.11.0, SqlDelight 2.0.2, KMMLogging 0.0.6, vitest 2.1.4, rollup 4.60.2, tailwindcss 3.4.14, autoprefixer 10.4.20, tsx 4.19.0, @preact/signals-core 1.8.0.

---

## Secret scan

Patterns searched (excluding `node_modules/`, `.git/`, `.gradle/`, `build/`, `dist/`):

- `BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY`
- `api[_-]?key`, `apikey`, `secret_key`
- `password\s*=`, `token\s*=` (with hardcoded value)
- `Bearer\s+[A-Za-z0-9_.-]{20,}`
- AWS `AKIA[0-9A-Z]{16}`
- GCP `AIza[0-9A-Za-z_-]{35}`
- Slack `xox[baprs]-`
- GitHub `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`
- Committed `.env*` files

| File:line | Match | Severity | Real / placeholder / example |
|-----------|-------|----------|------------------------------|
| `argus-urlconnection/src/test/kotlin/com/lynxal/argus/urlconnection/ArgusHttpURLConnectionTest.kt:77` | `Authorization: Bearer secret` | None | Test fixture string `"secret"` (literal) — not a credential. |
| `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/ArgusClientPluginTest.kt:202` | `append("authorization", "Bearer secret")` | None | Same — test fixture. |
| `argus-okhttp/src/test/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpInterceptorTest.kt:79` | `.header("Authorization", "Bearer secret")` | None | Test fixture. |
| `argus-webui/src/input/__tests__/keyboard.test.ts:19` | `value: 'Bearer secret'` | None | Test fixture. |
| `agent-os/specs/.../argus-ktor-client-plugin/standards.md:164,174` | "Bearer Token Refresh" header in markdown | None | Documentation heading. |
| `agent-os/standards/security/auth-flow.md:1,11` | "Bearer Token Refresh" heading | None | Documentation. |
| `agent-os/standards/cloud/service-layer.md:60` | `Bearer + auto-refresh` in a table cell | None | Documentation. |
| `agent-os/specs/.../argus-phase3/plan.md:102` | `Authorization: Bearer xyz` → `***redacted***` | None | Documentation example showing redaction. |

**No real secrets, no private keys, no AWS/GCP/Slack/GitHub tokens, no committed `.env` files detected.**

`local.properties` exists (contains only `sdk.dir=/Users/...`) and is correctly excluded by `.gitignore` (`/Users/vardan.kurkchiyan/AndroidStudioProjects/argus/.gitignore` line "Android / local config" → `local.properties`); `git check-ignore` confirms ignored.

Result: **clean — no secrets detected.**

---

## Top issues summary

Ranked by impact on a *debug-build, on-device deployment*:

1. **No auth + LAN exposure (by design, per §5.4)** — Severity **High** (mitigation: README warning + `debugImplementation`-only). Anyone on the same Wi-Fi can read every captured request, response body, and log on the inspected device. Documented; no code change required by spec, but reviewers should confirm consumer apps surface the warning.
2. **Vite 5.4.10 has multiple known dev-server CVEs (CVE-2025-30208 et al.)** — Severity **Moderate** (dev-only). Bump to `vite@5.4.18+` (or `vite@6`). Same with `esbuild@0.21.5` / `esbuild@0.23.1` → `esbuild@0.25+`. No on-device impact; only matters when a developer runs `npm run dev` on a shared/hostile network.
3. **Bodies are not redacted, only headers (per spec §3.7).** Severity **Informational** — but consumers should be told via README that secrets in JSON bodies are captured verbatim. The current README warning at line 30 says "any device on the same network can read tokens, PII, and internal traffic", which covers it; consider adding an explicit "header redaction does not extend to request/response bodies" note.
4. **First-party `com.lynxal.logging:logging@0.0.6`** is a 0.0.x version of an internal lib — out of normal CVE-feed visibility. Severity **Informational** — recommend that Lynxal's internal review covers it explicitly since it's outside the audit scope (§9 says auditor doesn't audit upstream KMMLogging, but version pinning is in this audit's scope).
5. **WebSocket subscription DoS surface (lagging-subscriber close)** — Severity **Low**. `Ws.kt:53` closes a slow subscriber. Acceptable. No fix needed; flagging only because it surfaces "INTERNAL_ERROR" with reason `"lagging"` — informational, not a leak.

---

## Notes & risks

- The audit's §6.12 items all pass on static review. The single architectural risk (no-auth on the bound port) is acknowledged in §5.4 of the spec and documented in the README.
- The dependency posture is current: Kotlin 2.2.0, Ktor 3.2.0, OkHttp 4.12.0 are all on supported lines with no recall-confident CVEs. Items marked `requires online check` should be verified by a vulnerability scanner against NVD and the GitHub Advisory database (`gh api /repos/.../security-advisories` or `osv-scanner`).
- The npm dev-time tooling (vite/esbuild/vitest) carries the only confidently recallable CVEs. None affect the built artifact.
- Secret scan is clean.
- Two architectural choices keep the attack surface small:
  - Static SPA assets are served from a `Map<String, BundleEntry>` lookup (`argus-webui-bundle/.../ArgusUiBundle.kt:13-25`) — there is **no filesystem path resolution** in the request path, so traversal is design-impossible.
  - Header redaction is enforced **at capture time** (`ArgusClientPlugin.kt:49`, `ArgusClientPlugin.kt:149`, plus the OkHttp + URLConnection equivalents), not in the UI. The bus, the ring buffer, the persistence layer, and the WebSocket frame all carry pre-redacted `Header` records. UI tampering cannot reveal the underlying value.
- Recommendation: **ship as-is for security**, with a follow-up to bump Vite/esbuild dev tooling and a one-line README addition clarifying that body content is not redacted.
