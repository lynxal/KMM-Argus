# Platform Init & DI

## Initialization Flow

### Android
Auto-initialized via `Application.onCreate()`:

```kotlin
class App : Application(), AppInfo {
    override fun onCreate() {
        startKoin {
            androidLogger(Level.ERROR)
            androidContext(this@App)
            modules(appModule, sharedAppModule(...), networkModule, domainModules)
        }
    }
}
```

### iOS
Manual initialization from Swift with pre/post hooks:

```swift
struct iOSApp: App {
    let appInitHelper = AppInitHelper()
    init() {
        appInitHelper.preInit()   // Firebase, etc.
        App_iosKt.doInitApp(appModuleFactory: IosAppModuleFactory())
        appInitHelper.postInit()  // Post-Koin setup
    }
}
```

This asymmetry is intentional — Android lifecycle requires `onCreate()`, iOS needs Swift-side control.

## Three-Layer DI

### 1. Platform-specific modules (expect val)

```kotlin
expect val appModule: Module       // Platform services
expect val networkModule: Module   // HTTP engine (OkHttp vs Darwin)
expect val domainModules: Module   // Platform use cases
```

### 2. Shared modules

- `sharedAppModule(factory)` — bridges platform factories into Koin
- `sharedNetworkModule` — common HTTP services (Account, Device, Scene, etc.)
- `sharedDomainModule` — common domain logic

### 3. AppModuleFactory (bridge pattern)

```kotlin
interface AppModuleFactory {
    fun createLoginHelper(): LoginHelper
    fun createDeviceIdentificationHelper(): DeviceIdentificationHelper
    fun createRemoteConfigProvider(): RemoteConfigProvider
    fun createAnalyticsDelegate(): AnalyticsDelegate
    fun createServiceDiscoveryBrowser(): ServiceDiscoveryBrowserInterface
    fun createApplicationCheckProvider(): ApplicationCheckProvider
}
```

- Android: inline implementation in `App.onCreate()`
- iOS: Swift class `IosAppModuleFactory` implements the interface
- Bridges platform SDKs (Firebase, Amplitude, Google Sign-In) into shared DI
