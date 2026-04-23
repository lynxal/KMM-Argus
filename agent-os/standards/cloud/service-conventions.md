# Service Implementation Conventions

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

## Structure

Interface + Impl split. Impl takes `HttpClientWrapper` (named `client`).

```kotlin
class SpaceServiceImpl(
    private val client: HttpClientWrapper
) : SpaceService
```

## URL Constants

Companion object with constants built from `HttpRoutes`:
```kotlin
companion object {
    const val BUILDINGS = "${HttpRoutes.ACCOUNT_BASE}/Buildings"
    const val BUILDING = "${HttpRoutes.ACCOUNT_BASE}/Building"
}
```

## Request Pattern

```kotlin
override suspend fun getBuildings(): Result<List<Building>> {
    return client.executeSafeGet<List<Building>> {
        url(BUILDINGS)
        header("accept", "application/json")
    }
}
```

- Always include `header("accept", "application/json")` per call (intentional, not centralized)
- JSON bodies: `contentType(ContentType.Application.Json)` + `setBody(request)`
- Form-encoded: `contentType(ContentType.Application.FormUrlEncoded)` + `setBody(formData)`
- Query params: `parameter(key, value)`
- Path variables: string interpolation in URL

## DI Registration

All services registered as `single<ServiceInterface>` in `NetworkModule`:
```kotlin
single<SpaceService> {
    SpaceServiceImpl(get(named<AuthorizedHttpClient>()))
}
```

**Common mistake:** Forgetting to register new services in NetworkModule.

## Platform HTTP Engines

- Android: OkHttp
- iOS: Darwin
- Both install: `Logging` (with 512-char chunked `CustomHttpLogger`), `ContentNegotiation` (JSON with `ignoreUnknownKeys = true`, `encodeDefaults = true`)
