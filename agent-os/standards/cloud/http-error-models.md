# HTTP Error Response Models

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

Two-tier error response system. This is the final shape — do not add more tiers.

## HttpErrorResponse (Standard Errors)

```kotlin
@Serializable
data class HttpErrorResponse(
    val errorCode: Int,
    val errorMessage: String,
    val httpErrorCode: Int = 0
) : RuntimeException("HTTP Error[$errorCode]: $errorMessage")
```

Backend standard error format. Extends `RuntimeException` for direct `Result.failure()` propagation.

## HttpValidationErrorResponse (ASP.NET Problem Details)

```kotlin
@Serializable
data class HttpValidationErrorResponse(
    val status: Int,
    val type: String = "",
    val title: String = "",
    val traceId: String = "",
    val errors: Map<String, List<String>> = emptyMap(),
    val httpErrorCode: Int = 0
) : RuntimeException("HTTP Error[$status] / $type: $title")
```

Field-level validation errors. `errors` maps field names to error messages.

## HttpResponseState (Domain Error Mapping)

Sealed hierarchy for domain-level error handling:

```kotlin
sealed interface HttpResponseState {
    data object Success : HttpResponseState
    sealed class Error(message: String) : HttpResponseState, Throwable(message)
}
```

Error subtypes: `ServerError` (5xx), `ClientError` (4xx + optional validation), `Unauthorized` (401), `TimeoutError`, `Cancelled`, `UnknownError`, `Information` (1xx), `HttpGenericError`, `IllegalState`.

## fromThrowable() Factory

`HttpResponseState.Error.fromThrowable(throwable)` maps any throwable to domain error:
- `HttpErrorResponse` / `HttpValidationErrorResponse` → status-code-based mapping
- `ConnectTimeoutException` / `SocketTimeoutException` → `TimeoutError`
- `CancellationException` → `Cancelled`
- Everything else → `UnknownError`

401 always maps to `Unauthorized` regardless of error body shape.
