# HttpClientWrapper & Safe Execution

All HTTP calls go through `HttpClientWrapper`. Never call `httpClient` directly from services.

## Constructor

`HttpClientWrapper(val httpClient: HttpClient, val coroutineScope: CoroutineScope)`

## Method Pattern

```kotlin
suspend inline fun <reified T> executeSafePost(
    crossinline block: HttpRequestBuilder.() -> Unit
): Result<T>
```

Available: `executeSafePost`, `executeSafeGet`, `executeSafePatch`, `executeSafePut`, `executeSafeDelete`.
New HTTP methods must follow `executeSafe{Method}` naming.

- `inline reified T` captures type at compile time for Ktor body deserialization
- `crossinline` enables builder DSL with suspension
- All return `Result<T>` — no exceptions leak to callers
- All wrapped in `withContext(coroutineScope.coroutineContext)`

## Multi-Level Error Parsing

On non-success status, cascading deserialization:
1. Try `HttpErrorResponse` (standard backend error)
2. On `JsonConvertException`/`NoTransformationFoundException` → try `HttpValidationErrorResponse` (ASP.NET Problem Details)
3. On second failure → generic `HttpErrorResponse` from HTTP status code/description

Uses `tryCatch` helper:
```kotlin
suspend inline fun <reified T> tryCatch(
    exceptionFilter: (Exception) -> Boolean,
    block: suspend () -> T,
    recoveryBlock: suspend (Exception) -> T
): T
```

Filter-based approach handles Ktor's inconsistent exception wrapping and is reusable across different parsing scenarios.

## Error Result

Failed results wrap the error response as `RuntimeException`:
- `HttpErrorResponse` extends `RuntimeException`
- `HttpValidationErrorResponse` extends `RuntimeException`
- Callers use `HttpResponseState.Error.fromThrowable()` to map to domain errors
