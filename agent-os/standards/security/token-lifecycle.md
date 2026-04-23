# Token Lifecycle

All tokens stored in KVault (encrypted). No exceptions — never keep tokens in memory only.

## Storage Layer

- `TokenStorage` interface + `TokenStorageImpl(KVault, CoroutineScope)`
- `TokenRepository` facades TokenStorage, exposes `isSignedIn: StateFlow<Boolean?>`
- All operations wrapped in `withContext(coroutineScope.coroutineContext)`

## State Observability

- `isSignedIn: StateFlow<Boolean?>` — null = not yet checked, true/false = resolved
- `hasRefreshToken: StateFlow<Boolean?>` — same tri-state semantics
- Updated via `updateTokenStates()` after every write

## Invalidation Strategy

Overwrite with `"invalid"` string — never delete the key:
```kotlin
encryptedStorage.set(ACCESS_TOKEN_KEY, "invalid")
```
Preserves key existence to distinguish "invalidated" from "never stored" (null).

## Defensive Defaults

- `getAccessToken()` / `getRefreshToken()` return empty string on error
- Catch `RuntimeException`, log, never throw from storage reads
- `clearAll()` sets both StateFlows to `false` after `encryptedStorage.clear()`

## Storage Keys

- `ACCESS_TOKEN_KEY = "accessToken"`
- `REFRESH_TOKEN_KEY = "refreshToken"`
