# Version Management

## Version Format

`{major}.{minor}.{buildId}` — e.g., `0.7.1710340000000`

- `appVersionMajor` / `appVersionMinor`: manually bumped in root `build.gradle.kts`
- `appVersionBuildId`: `System.currentTimeMillis()` — every build is unique for traceability
- `appVersionDisplay`: `{major}.{minor}.{buildId}-{flavor}` (includes build flavor)

```kotlin
val appVersionMajor by extra { 0 }
val appVersionMinor by extra { 7 }
val appVersionBuildId: Long by extra { System.currentTimeMillis() }
val appVersionName by extra { "$appVersionMajor.$appVersionMinor.$appVersionBuildId" }
```

## Android versionCode

```kotlin
versionCode = appVersionMajor * 100 + appVersionMinor + 1
```

Historical formula. The `+1` is an artifact (ensures > 0 when major=0, minor=0).

## BuildKonfig Flavors

Three environments configured in `shared/build.gradle.kts`:

| Flavor | Base URL | App ID Suffix | Signing |
|--------|----------|---------------|---------|
| `development` | dev-residential-api.lynxal.com | `.dev` | localBuild2 |
| `staging` | lynxal-residential-api-staging-*.azurewebsites.net | `.stg` | localBuild3 |
| `production` | lynxal-api.azurewebsites.net | (none) | localBuild |

Select flavor via gradle property: `-Pbuildkonfig.flavor=development`
Default in `gradle.properties`: `buildkonfig.flavor=development`

BuildKonfig fields: `BASE_URL`, `GOOGLE_WEB_CLIENT_ID`, `IS_PRODUCTION`, `REMOTE_TYPE`, `BUILD_INFO`

Access: `com.lynxal.canvasprovisioner.BuildKonfig.BASE_URL`

## Android Manifest Placeholders

Each flavor sets distinct app name and launcher icon per build type:

```kotlin
// development + debug
manifestPlaceholders["appName"] = "@string/app_name_dev"
manifestPlaceholders["appIcon"] = "@mipmap/ic_launcher_dev_debug"

// production + release
manifestPlaceholders["appName"] = "@string/app_name"
manifestPlaceholders["appIcon"] = "@mipmap/ic_launcher_prod_release"
```

Pattern: `ic_launcher_{env}_{buildType}` for icons.

## Firebase App Distribution

- Dev/staging: `fad-service-account-dev.json`, group `all-testers`
- Production: `fad-service-account.json`, group `all-testers`
- All flavors distribute APK artifacts
