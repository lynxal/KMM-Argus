# Expect/Actual Conventions

## File Naming

- Common declaration: `ClassName.kt` in `commonMain/`
- Platform actuals: `ClassName.android.kt`, `ClassName.ios.kt`
- Per-architecture (cinterop): use `iosArm64Main/`, `iosSimulatorArm64Main/`

## Which Form to Use

| Form | When | Example |
|------|------|---------|
| `expect class` | Platform-specific constructor params or deps | `GetCountryCodeUseCase(context)` vs `GetCountryCodeUseCase()` |
| `expect object` | Stateless singleton with platform impl | `CryptoUtils` (BouncyCastle vs SwiftCryptoBackend) |
| `expect fun` | Standalone function, esp. `@Composable` | `PlatformSpecificAppTheme()`, `stringResource()` |
| `expect val` | Platform-specific singleton or constant | `appInfo`, `appModule` |
| `expect interface` | Marker interface differing per platform | `MultiplatformSerializable` |

## Platform Stubs

- Stubs (e.g. `return true`) are acceptable when the functionality is irrelevant on that platform
- Mark intentional stubs with a comment: `// Not needed on iOS`
- Stubs that represent missing functionality are tech debt — add a `// TODO` comment

## Source Set Structure

```
module/src/
  commonMain/    → expect declarations + shared logic
  androidMain/   → actual implementations (Android SDK)
  iosMain/       → actual implementations (Foundation/UIKit)
  iosArm64Main/  → device-specific (cinterop .def files)
  iosSimulatorArm64Main/ → simulator-specific (cinterop .def files)
  nativeMain/    → shared across iOS targets only
```

## Rules

- Keep expect declarations minimal — push shared logic to commonMain functions that call the expect
- Prefer `expect fun` over `expect class` when no platform-specific state is needed
- All expect declarations must have actuals for both Android and iOS — no partial implementations
