# Argus Project Audit — Plan

A static audit of the Argus codebase against `argus-audit-spec.md` (root), executed via parallel sub-agents and consolidated into a single audit report.

## Scope

1. **Completeness** — every requirement in §5 (functional) and §6 (verification checklist) of `argus-audit-spec.md`.
2. **Missing features** — anything called for in MVP that is absent or incomplete.
3. **Security scanning** — code review (redaction, CORS, LAN exposure), dependency CVEs, secret scanning.

## Decisions (from shaping)

- **Audit depth:** static review only. Runtime/perf items (§6.5.3, §6.7.1–7, §6.11) are marked **unverified — requires runtime**.
- **Security scope:** code review + dependency CVEs (static, version-based) + secret scanning (grep).
- **Phase 3/4 modules** (`:argus-okhttp`, `:argus-urlconnection`, `:argus-ios`): **in-scope**, audited as first-class — not flagged as drift.

## Strategy

Eight Explore sub-agents run in parallel, each owning one audit slice. Each writes findings to its own file under `findings/`. After all eight return, a final consolidation pass produces `audit-report.md`.

Agents owning a large slice may recursively dispatch their own sub-agents (per user guidance: "split into subtasks and use sub-agents for sub-tasks").

## Sub-agent assignments

| Agent | Slice | Spec sections | Output |
|-------|-------|---------------|--------|
| A | Architecture & Distribution | §6.1 + §6.3 | `findings/01-architecture.md` |
| B | Capture correctness | §6.2 | `findings/02-capture.md` |
| C | Server & ring buffer | §6.4 + §6.5 | `findings/03-server.md` |
| D | Web UI | §6.6 + §6.7 | `findings/04-webui.md` |
| E | Sample app | §6.8 | `findings/05-sample.md` |
| F | Documentation & code quality | §6.9 + §6.10 | `findings/06-docs-quality.md` |
| G | Security | §6.12 + deps + secrets | `findings/07-security.md` |
| H | Phase 3 / Phase 4 modules | (in-scope) | `findings/08-phase34.md` |

## Tasks

1. Create spec scaffolding (this folder).
2. Dispatch eight Explore agents in parallel.
3. Consolidate findings into `audit-report.md`.

## Folder layout

```
agent-os/specs/2026-04-30-1845-project-audit/
├── plan.md                       # this file
├── shape.md                      # shaping notes
├── standards.md                  # relevant standards
├── references.md                 # primary spec + product files
├── findings/                     # one file per agent
│   ├── 01-architecture.md
│   ├── 02-capture.md
│   ├── 03-server.md
│   ├── 04-webui.md
│   ├── 05-sample.md
│   ├── 06-docs-quality.md
│   ├── 07-security.md
│   └── 08-phase34.md
└── audit-report.md               # consolidated executive report
```

## Verification

1. All eight `findings/*.md` files exist and reference §6.x line items.
2. `audit-report.md` contains: executive summary, scorecard, critical defects, risk register, performance status, security summary, Phase 3/4 status, recommendation.
3. Recommendation is one of {ship, ship-with-corrections, block} with backing rationale.
