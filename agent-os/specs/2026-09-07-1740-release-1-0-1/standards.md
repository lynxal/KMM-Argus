# Standards for Release 1.0.1

One standard applies to this work. The other 16 categories in `agent-os/standards/` describe
the parent Canvas app domain (BLE mesh, SignalR, screen models, persistence) and have no
bearing on cutting a release.

---

## workflow/commit-conventions

# Commit Conventions

## Commit Message Format

```
<type>: <subject> [optional (#issue)]

[optional body]
```

### Types

| Type       | When to use                                    |
|------------|------------------------------------------------|
| `feat`     | New feature or capability                      |
| `fix`      | Bug fix                                        |
| `refactor` | Code restructuring without behavior change     |
| `chore`    | Build, dependency, config, or tooling changes  |
| `docs`     | Documentation only                             |
| `test`     | Adding or updating tests                       |
| `style`    | Formatting, whitespace, import ordering        |
| `perf`     | Performance improvement                        |
| `ci`       | CI/CD pipeline changes                         |
| `build`    | Build system or dependency changes             |

### Rules

- Subject line: imperative mood, max 72 characters, no trailing period.
- Body (optional): explain **why**, not **what**. Wrap at 72 characters.
- Reference GitHub issues when applicable: `(#123)`.
- **No agent attribution**: commits MUST NOT include `Co-Authored-By`, `Signed-off-by`, or any
  trailer that identifies an AI agent. Commits should be indistinguishable from human-authored
  commits.

### Staging

- Stage files explicitly by name — avoid `git add -A` or `git add .`.
- Never stage secrets (`.env`, credentials, tokens, `google-services.json`).
- Do not mix unrelated changes in a single commit.

### Examples

```
fix: disable controls when device is disconnected (#338)
```

```
refactor: migrate Home screens to koinViewModel for proper scoping

The previous approach leaked ViewModel instances across navigation
destinations because Voyager's navigator-scoped lifecycle was too broad.
```

```
feat: add CCT slider to CanvasControlView (#350)
```

---

## How it applies here

- `chore:` for the version bump and the pin sweep.
- `docs:` for the README §9.3 correction and the `AGENTS.md` release-checklist step.
- `chore:` for extending `:verifyVersionPins` and adding the screenshot script.
- `docs:` for the refreshed `docs/ui/*.png`.
- No `Co-Authored-By` trailer on any commit in this repo.
- Stage by name. The pin sweep touches unrelated-looking files (`Package.swift`, two npm
  manifests, `README.md`) that belong in one commit because they are one change: they must
  agree with `argus.version` or the build fails.
