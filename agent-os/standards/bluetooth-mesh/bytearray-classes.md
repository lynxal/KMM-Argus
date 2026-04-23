# ByteArray in Classes

Kotlin data classes use reference equality for ByteArray fields by default.
This breaks equality checks silently. Two rules prevent this:

## Rule 1: Data class with ByteArray → override equals/hashCode

Use `contentEquals()` and `contentHashCode()`:

```kotlin
data class ApplicationNonce(
    val szmic: Int,
    val ivIndex: ByteArray  // ← triggers rule
) : Nonce() {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ApplicationNonce) return false
        return szmic == other.szmic
            && ivIndex.contentEquals(other.ivIndex)
    }
    override fun hashCode(): Int {
        var result = szmic
        result = 31 * result + ivIndex.contentHashCode()
        return result
    }
}
```

Use this for: PDUs, nonces, crypto results, any structured
type that benefits from copy()/destructuring.

## Rule 2: Simple ByteArray wrappers → regular class

When a class is just a thin wrapper around ByteArray with no
need for equality/copy/destructuring, use a regular class:

```kotlin
// Correct: regular class for simple payload wrapper
class NodeXYResponse(val nodeXY: ByteArray) : ProvisioningInfo()

// Wrong: data class without overrides
data class NodeXYResponse(val nodeXY: ByteArray) : ProvisioningInfo()
```

Use this for: provisioning payloads, one-off wrappers,
sealed class variants carrying raw bytes.

## When to use which

| Need copy()/destructuring? | Has non-ByteArray fields? | → Use |
|---|---|---|
| Yes | Yes | Data class + overrides |
| No | No | Regular class |
| Yes | No | Data class + overrides |
