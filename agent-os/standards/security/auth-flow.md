# Auth Flow & Bearer Refresh

## Dual HTTP Clients

Two named clients registered in Koin:
- `AuthorizedHttpClient` — Ktor Auth plugin installed, automatic bearer token refresh
- `UnauthorizedHttpClient` — No Auth plugin, used for login/signup/refresh endpoints

Never mix them. Authenticated endpoints must use `AuthorizedHttpClient`.

## Bearer Token Refresh

Ktor Auth plugin handles 401 responses automatically:
```kotlin
install(Auth) {
    bearer {
        loadTokens { BearerTokens(tokenRepo.getAccessToken(), tokenRepo.getRefreshToken()) }
        refreshTokens { get<RefreshAccessTokenUseCase>().execute() }
    }
}
```

`RefreshAccessTokenUseCase.execute()` always returns `BearerTokens` — Ktor's `refreshTokens` callback requires it. On refresh failure with 4xx, triggers `logoutUseCase.execute()`.

## Manual Token Refresh Trigger

`RequestAccessTokenRefreshUseCase` forces a refresh cycle:
1. `tokenRepository.invalidateAccessToken()` (overwrite with "invalid")
2. `httpClient.invalidateBearerTokens()` (clears Ktor's internal cache)
3. Next HTTP request triggers automatic refresh via Auth plugin

## Conditional Retries

Retries gated on token availability — prevents retry loops on expired credentials:
```kotlin
val tokenAvailable = get<TokenStorage>().hasRefreshToken.value ?: false
retryIf(maxRetries = 3) { _, response ->
    response.status.value in 500..599 && tokenAvailable
}
```
Exponential delay: base 1.5, max 10s, randomization 100ms.

## Common Mistakes

- Wrong request/response DTO for the endpoint
- Missing `@Serializable` annotation on new DTOs
- All service request/response classes must be annotated with `@Serializable`
