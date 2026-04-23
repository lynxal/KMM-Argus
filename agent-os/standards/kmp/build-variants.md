# Build Variants (BuildKonfig)

## Flavors

Three build flavors controlled by `buildkonfig.flavor` gradle property:

| Flavor | API Environment | AppCheck | Crash Reporting | Logging |
|--------|----------------|----------|-----------------|---------|
| `development` | dev API | Debug (hardcoded secret) | Shake (enabled) | Verbose |
| `staging` | staging API | Debug (hardcoded secret) | Shake (enabled) | Verbose |
| `production` | production API | PlayIntegrity | Disabled | Standard |

## Source Set Layout

```
shared/src/
  development/   → AppInit with debug AppCheck, Shake, verbose logging
  staging/       → AppInit with staging-specific config (will diverge from dev)
  production/    → AppInit with PlayIntegrity, no crash reporting
```

## Flavor-Dependent Dependencies

In `shared/build.gradle.kts`:
- `development` / `staging`: `firebase.integrity.debug`, `shake`
- `production`: `firebase.integrity` (no debug, no Shake)

## BuildKonfig Values

Configured per flavor in `shared/build.gradle.kts`:
- `BASE_URL` — API base URL per environment
- `IS_PRODUCTION` — `false` for dev/staging, `true` for production
- `GOOGLE_WEB_CLIENT_ID` — Auth client ID per environment

## Rules

- **Flavors are primarily for infrastructure config** — API URLs, keys, logging, crash reporting
- Feature flags are separate from build flavors
- Debug-only dev tools may be flavor-gated when needed
- **Never commit production secrets** to flavor source sets — use CI/environment variables
- Each flavor has its own `AppInit` class — keep initialization logic self-contained per flavor
