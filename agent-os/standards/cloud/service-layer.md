# Service Layer Pattern

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

Every REST service uses an interface + implementation split for testability.

## Structure

```
remote/services/
  DeviceService.kt          // interface
  DeviceServiceImpl.kt      // implementation
```

**Interface:** Defines suspend functions returning `Result<T>`. No HTTP details.

```kotlin
interface DeviceService {
    suspend fun saveDevice(request: NewDeviceRequest): Result<Unit>
    suspend fun deleteDevice(deviceUuid: String): Result<Unit>
}
```

**Implementation:** Takes `HttpClientWrapper`, defines URL constants in companion object.

```kotlin
class DeviceServiceImpl(
    private val client: HttpClientWrapper
) : DeviceService {
    companion object {
        const val DEVICE = "${HttpRoutes.BASE_URL_FULL}/Device"
        const val DEVICE_ID = "${HttpRoutes.BASE_URL_FULL}/Device/"
    }

    override suspend fun saveDevice(request: NewDeviceRequest): Result<Unit> {
        return client.executeSafePost<Unit> {
            url(DEVICE)
            header(HttpHeaders.Accept, ContentType.Application.Json)
            contentType(ContentType.Application.Json)
            setBody(request)
        }
    }
}
```

## Rules

- URL constants in `companion object`, built from `HttpRoutes.BASE_URL_FULL`
- Every method returns `Result<T>` — never throws
- Always set both `Accept` and `contentType` to `Application.Json`
- Use `client.executeSafe{Get|Post|Put|Delete}` — never raw Ktor calls
- One service per REST resource (Device, Space, Zone, etc.)

## HTTP Client Types

Two `HttpClientWrapper` instances registered in Koin:

| Qualifier | Usage | Auth | Retry |
|-----------|-------|------|-------|
| `AuthorizedHttpClient` | All authenticated endpoints | Bearer + auto-refresh | 5xx + timeout (if token present) |
| `UnauthorizedHttpClient` | Login, signup, token refresh | None | 5xx + timeout |

Retry: exponential backoff (base 1.5, max 10s). Never retries 4xx.

## DI Registration

Register as singleton, typed to interface, inject the correct client:

```kotlin
single<DeviceService> {
    DeviceServiceImpl(get(named<AuthorizedHttpClient>()))
}
```

Only `UnauthorizedAccountService` uses `UnauthorizedHttpClient`.
