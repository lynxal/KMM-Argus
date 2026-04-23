# Login & Session Management

## LoginState Sealed Hierarchy

```kotlin
sealed interface LoginState {
    object Success : LoginState
    sealed class Error(message: String) : LoginState, Throwable(message) { ... }
}
```

Error subtypes: `ServerError`, `EmailVerificationError`, `CredentialError`, `UnknownError`, `TimeoutError`.

Dual inheritance is intentional:
- `Throwable` — propagates through `Result.failure()` chains
- `sealed` — exhaustive `when` matching in UI code

`CredentialError` carries field-level validation: `errors: Map<String, List<String>>`.

## Login Flow

1. `LoginUseCase.execute(userName, password)` calls `UnauthorizedAccountService.login()`
2. On success: `clearStoredDataUseCase.execute()` then `tokenRepository.storeTokens()`
3. On failure: HTTP error mapped to `LoginState.Error` subtype via `HttpResponseState.Error.fromThrowable()`

## Session Storage

- `SessionStorage` tracks selected building, mesh UUID, sync dates
- `selectedBuildingIdFlow: SharedFlow<Long>` with replay=1 for latest-value caching
- Buildings persisted in SQLDelight; mesh data in LocalStorage

## Logout & Data Cleanup

Multi-stage logout via `LogoutUseCase`:
1. `ClearStoredDataUseCase` — clears all user-scoped storages
2. `TokenStorage.clearAll()` — wipes encrypted tokens
3. `httpClient.invalidateBearerTokens()` — clears Ktor's internal cache
4. `Analytics.resetAnalytics()` — resets user identity

**Rule:** Every new user-scoped storage must be added to `ClearStoredDataUseCase`. App-level config storages are excluded.

## Firebase AppCheck

All unauthenticated auth endpoints require `X-Firebase-AppCheck` header:
```kotlin
header("X-Firebase-AppCheck", apCheckProvider.getAppCheckToken())
```
Android uses Firebase AppCheck SDK. Token cached with expiry tracking. Falls back to `"INVALID"` on error.

## Auth Request Format

- Login and refresh use form-encoded bodies (`ContentType.Application.FormUrlEncoded`)
- `LoginRequest.urlEncodedRequestBody` / `RefreshRequest.urlEncodedRequestBody` (lazy)
- Refresh includes conditional `Building-Id` header for multi-tenant context
