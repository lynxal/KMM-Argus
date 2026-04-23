# Entity Validation

Fail-fast validation for **Bluetooth Mesh domain entities only**. This pattern is driven by the BT Mesh spec and is not used in other domains.

## Validate in init{}

Mesh entities validate in their `init` block using `ValidatorInterface` implementations:

```kotlin
data class ApplicationKey(
    val name: String,
    val index: Int,
    val key: String,
    val oldKey: String? = null
) {
    init {
        IntValidator(IntValidator.RangeType.KEY_INDEX).apply {
            validate(index)
        }
        StringValidator(StringValidator.RegexType.KEY).apply {
            validate(key)
            oldKey?.also { validate(it) }
        }
    }
}
```

## Validator Types

**StringValidator:**
- `RegexType`: UUID, STANDARD_UUID, IDENTIFIER, ADDRESS_UNICAST, ADDRESS_GROUP, KEY, TIMESTAMP
- `ListType`: FEATURES, SECURITY_LEVEL
- Pre-defined combos: `anyAddress`, `groupAddressOrUUID`, `parentAddress`, `subscribeAddress`

**IntValidator:**
- `RangeType`: CREDENTIALS (0-1), COUNT (0-7), TTL (0-127), KEY_INDEX (0-4095), ELEMENT_INDEX (0-255)
- `ListType`: FEATURE_STATE, PUBLISH_RESOLUTION, PUBLISH_RETRANSMIT_INTERVAL

## Error Propagation

- Validators throw `IllegalArgumentException` via `require()`
- Callers (repositories, use cases) **catch at boundaries** and wrap in `Result.failure()`
- Invalid mesh entities should never exist in memory

## Nullable Fields

Use `?.also {}` for optional field validation:

```kotlin
oldKey?.also { validate(it) }
```
