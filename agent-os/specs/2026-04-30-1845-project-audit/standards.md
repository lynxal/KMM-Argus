# Standards for Argus Project Audit

This audit primarily measures the codebase against `argus-audit-spec.md` (the contract). The standards below provide additional context for the security and code-quality slices of the audit.

---

## security/auth-flow, security/login-session, security/token-lifecycle

**Why it applies:** Argus has no authentication in v1 (per spec §5.4 "Auth: none in v1"). The security audit must verify the README explicitly documents LAN-exposure risk (§6.12.5) and that no token storage / auth code accidentally landed in capture paths.

**Key points for the audit:**
- Argus is a debug-only inspector — auth is intentionally absent. The risk is exposure on untrusted LANs.
- The default redacted headers (`Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`) protect captured events from leaking auth material from the inspected app.
- Captured events should never be transmitted off-device. Egress check is a static grep for outbound URLs in `:argus-*` modules.

---

## kmp/module-boundaries

**Why it applies:** The audit spec §3.3 demands KMP-first capture with platform-thin shells. §6.10.7 requires no platform-specific code in `commonMain` of any KMP module.

**Key points for the audit:**
- `:argus-core` `commonMain` must compile for jvm, android, ios.
- `:argus-server-core` `commonMain` holds routing + ring-buffer + query logic; only `expect class ArgusServer` is platform-bound.
- `:argus-webui-bundle` is KMP byte-array constants consumed by `:argus-server-core`.
- Dependency direction must be downward only.

---

## workflow/commit-conventions

**Why it applies:** Not directly — this audit produces no commits. Noted only because the user's auto-memory contains a "no AI attribution" feedback rule that would apply if the audit ever leads to remediation commits.

---

## naming/code-documentation

**Why it applies:** Spec §6.10.2 requires KDoc on all public API classes, properties, and functions. The audit's documentation pass uses this standard's "document why not what" guidance to assess KDoc quality, not just presence.
