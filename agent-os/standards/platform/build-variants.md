# Build Variants (Environments)

Three environments configured via `appBuildFlavor` gradle variable.

Set in `gradle.properties`:
```properties
buildkonfig.flavor=development   # or staging, production
```

Or override via terminal: `-Pbuildkonfig.flavor=development`

Possible values: `development`, `staging`, `production`

## Environment Differences

| | Development | Staging | Production |
|---|-------------|---------|------------|
| API URL | dev-residential-api.lynxal.com | lynxal-residential-api-staging-... | lynxal-api.azurewebsites.net |
| App ID suffix | `.dev` | `.stg` | (none) |
| App name | app_name_dev | app_name_stage | app_name |
| App icon | Dev-specific | Shared | Shared |
| Bug reporting | Shake SDK enabled | Shake SDK enabled | Disabled |
| AppCheck | DebugAppCheckProvider | DebugAppCheckProvider | PlayIntegrity (Android) |
| Log level | Verbose | Verbose | Default |

## Conditional Dependencies

```kotlin
// shared/build.gradle.kts
if (appBuildFlavor == "development" || appBuildFlavor == "staging") {
    implementation(libs.firebase.integrity.debug)
} else if (appBuildFlavor == "production") {
    implementation(libs.firebase.integrity)
}

if (appBuildFlavor != "production") {
    implementation(libs.shake)  // Bug reporting
}
```

## Source Set Structure

```
shared/src/
  commonMain/       # All environments
  development/      # Dev-only initialization
  staging/          # Staging-only initialization
  production/       # Prod-only initialization
  androidMain/      # Android platform
  iosMain/          # iOS platform
```

Environment source sets contain `AppInit.kt` with:
- Firebase AppCheck provider selection
- Shake SDK initialization (dev/staging only)
- Logger level configuration

## Android Signing

Each flavor has its own signing config with different keystore/alias.
App ID suffix ensures side-by-side installs.

## iOS Variants

- Separate Xcode schemes: Development, Staging, Production
- Per-variant `Info.plist` files
- `ExportOptions.plist` for archive distribution
