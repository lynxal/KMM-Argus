# Request/Response Modeling

> Full API endpoint mapping and Scalar documentation references live in `backend_api_docs/` — see `backend_api_docs/implementation-mapping.md` for the master index.

All API models use `kotlinx.serialization` with `@Serializable`.

## Package Structure

```
domain/entity/remote/
  requests/     // outgoing request bodies
  responses/    // incoming response models
```

## Serialization Rules

- Use `@SerialName` to map snake_case/PascalCase API fields to camelCase Kotlin properties
- All fields nullable with defaults where the API may omit them
- Use `data class` for all request/response models

```kotlin
@Serializable
data class NewDeviceRequest(
    val name: String,
    val uuid: String,
    @SerialName("spaceId")
    val spaceId: Long?,
    val illustrationId: String = "default"
)
```

## Integer-Based State Encoding

The backend API uses integers for boolean states (matches embedded protocol):

```kotlin
@Serializable
data class SetOnOffStateRequest(
    val transactionId: Int?,
    val transitionTime: Long?,
    val delay: Long?,
    val onOff: Int  // 0 = off, 1 = on
)
```

- Convert domain booleans to Int at the request boundary: `if (isOn) 1 else 0`
- Duration values sent as milliseconds (`Long`)

## Form-Encoded Login (Exception)

Login uses `FormDataContent` instead of JSON. The request class provides a lazy `urlEncodedRequestBody`:

```kotlin
@Serializable
data class LoginRequest(
    @SerialName("ClientId") val clientId: String = "admin_client",
    @SerialName("GrantType") val grantType: String = "password",
    @SerialName("UserName") val userName: String,
    @SerialName("Password") val password: String,
) {
    val urlEncodedRequestBody: FormDataContent by lazy { ... }
}
```

This is the only endpoint using form encoding. All other endpoints use JSON.

## Serialization by Transport

| Transport | Format | Usage |
|-----------|--------|-------|
| REST API | JSON (`kotlinx.serialization`) | All cloud API communication |
| BLE Gateway | ProtoBuf (`@ProtoNumber`) | Provisioning & configuration via BLE |

ProtoBuf example (gateway only):

```kotlin
@Serializable
data class GatewayConfigurationStatusMessage(
    @ProtoNumber(1) val status: Int? = null,
    @ProtoNumber(2) val errorCode: Int? = null,
)
```
