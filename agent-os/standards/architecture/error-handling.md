# Error Handling

Domain errors are sealed class hierarchies that extend both a sealed
interface AND `Throwable`. This is deliberate: sealed for pattern
matching, Throwable for `Result.failure()` compatibility.

## Pattern: Sealed Error Hierarchy

```kotlin
sealed interface LoginState {
    object Success : LoginState
    sealed class Error(message: String) : LoginState, Throwable(message) {
        data class ServerError(val code: Int, ...) : Error(message)
        data class CredentialError(val errors: Map<String, List<String>>, ...) : Error(message)
        data class TimeoutError(...) : Error(message)
    }
}
```

## Pattern: HTTP Error Mapping

`HttpResponseState.Error.fromThrowable()` is the central factory that
maps raw exceptions to domain error types:

```kotlin
// In use cases — convert raw errors to domain types:
service.call().recoverCatching { error ->
    throw HttpResponseState.Error.fromThrowable(error).also {
        Logger.error(it.message, it)
    }
}
```

Mapping: `HttpException` → status code → domain type:
- 401 → `Unauthorized`
- 400-499 → `ClientError` (may include `HttpValidationErrorResponse`)
- 500+ → `ServerError`
- Timeout exceptions → `TimeoutError`
- `CancellationException` → `Cancelled`

## Rules

- Feature-specific states (LoginState, CreateAccountState) define
  their own sealed error subtypes
- Always use `recoverCatching` + `fromThrowable()` to convert service
  exceptions into domain errors
- Log errors before re-throwing in recoverCatching
- `ClientError` carries optional `validationError` for field-level
  validation from the API
