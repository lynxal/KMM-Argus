# HTTP Result & Error Handling

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

All remote calls return `Result<T>` via `HttpClientWrapper`. Never throw from services.

## HttpClientWrapper Methods

```kotlin
client.executeSafeGet<T> { ... }    // GET
client.executeSafePost<T> { ... }   // POST
client.executeSafePut<T> { ... }    // PUT
client.executeSafeDelete<T> { ... } // DELETE
client.executeSafePatch<T> { ... }  // PATCH
```

All run on the wrapper's `coroutineScope` context. All return `Result<T>`.

## Error Parsing Chain

On non-2xx responses, errors are parsed in order:

1. **`HttpErrorResponse`** — business errors (`{ errorCode, errorMessage }`)
2. **`HttpValidationErrorResponse`** — validation errors (`{ status, type, title, errors }`)
3. **Fallback** — generic from HTTP status code and description

Each level catches `JsonConvertException` / `NoTransformationFoundException` before falling to the next. The `httpErrorCode` field is always set from the actual HTTP status.

## Error Response Classes

Both extend `RuntimeException` AND are `@Serializable` — dual-purpose for Result.failure() and throw contexts:

```kotlin
@Serializable
data class HttpErrorResponse(
    val errorCode: Int,
    val errorMessage: String,
    val httpErrorCode: Int = 0
) : RuntimeException("HTTP Error[$errorCode]: $errorMessage")

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

## Rules

- Never throw from service methods — always return `Result<T>`
- Check `result.isSuccess` / use `onSuccess`/`onFailure` at call sites
- Network exceptions (timeout, connectivity) are caught and wrapped in `Result.failure()`
- Two error shapes exist because the API returns different formats for business errors vs validation errors (legacy API)
- `httpErrorCode` carries the raw HTTP status for downstream classification (4xx vs 5xx)
