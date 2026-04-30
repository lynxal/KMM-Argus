# References for Argus Project Audit

## Primary contract

### argus-audit-spec.md

- **Location:** repo root, `argus-audit-spec.md`
- **Relevance:** the single source of truth for what the audit measures against. Sections §3 (architectural constraints), §5 (functional requirements), §6 (verification checklist with 12 sub-categories), §7 (phase boundaries), §8 (reviewer deliverables) are all in scope.

## Product context

### agent-os/product/mission.md

- **Location:** `agent-os/product/mission.md`
- **Relevance:** background on why Argus exists. **Caution:** partially stale — mentions mDNS via `:lantern-android`, which spec §3.8 drops. The audit follows the spec, not mission.md.

### agent-os/product/roadmap.md, tech-stack.md

- **Location:** `agent-os/product/`
- **Relevance:** roadmap may help calibrate expectations on Phase 3/4 module maturity.

## Per-slice references

### Architecture & Distribution (Agent A)

- `settings.gradle.kts` (root)
- Every module's `build.gradle.kts`
- `gradle/libs.versions.toml`
- `.github/workflows/` (CI for `verifyReleaseHasNoArgus` per §6.3.7)
- `sample/` source-set layout

### Capture (Agent B)

- `:argus-core/src/commonMain/` — Ktor plugin + KMMLogging delegate + event model
- `:argus-core/src/commonTest/`

### Server & ring buffer (Agent C)

- `:argus-server-core/src/commonMain/`
- `:argus-android/src/main/` (actual ArgusServer)

### Web UI (Agent D)

- `argus-webui/`
- `docs/design/` (or note absence)
- `argus-webui-bundle/`

### Sample app (Agent E)

- `sample/` whole tree, especially `src/main/`, `src/debug/`, `src/release/`

### Docs & code quality (Agent F)

- `README.md` (root)
- All modules' `commonMain` (KDoc, smell scans)
- All modules' `commonTest`

### Security (Agent G)

- `:argus-core/` redaction code
- `:argus-server-core/` CORS + route handlers
- `gradle/libs.versions.toml`, `argus-webui/package.json`, `argus-webui/package-lock.json` (CVE check)
- Whole repo (secret scan)

### Phase 3/4 (Agent H)

- `:argus-okhttp/`, `:argus-urlconnection/`, `:argus-ios/`

## Standards referenced

See `standards.md` in this folder.
