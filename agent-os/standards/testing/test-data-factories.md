# Test Data Factories

Use factory functions with default parameters instead of builders or raw constructors.

## Factory Function Pattern

```kotlin
fun createDummySpaceData(
    id: Long = 0,
    name: String = "DummyZone",
    address: Int = 0,
    parentId: Long? = null,
    devices: List<SpaceDeviceData> = emptyList()
) = SpaceData(
    id = id,
    name = name,
    address = address,
    parentId = parentId,
    devices = devices
)
```

- Prefix with `createDummy` or `createTest`
- All parameters have sensible defaults
- Tests override only the fields they care about:

```kotlin
@Test
fun `orphan node has no space`() {
    val node = createDummyNode(uuid = "test-uuid")
    // All other fields use defaults
}
```

## Factory Location

- **Module-specific factories** for module-internal entities (e.g., mesh entities in `lynxmesh/commonTest/`)
- **Shared factories** for cross-module entities in `shared/commonTest/util/TestDataCreation.kt`

## Spec Test Vectors

For cryptography and BT Mesh protocol tests, use hard-coded test vectors from the specification:

```kotlin
@Test
fun `K1 derivation matches Mesh spec`() {
    // Values from Bluetooth Mesh Profile Specification
    val n = Bytes.fromHexString("3216d1509884b533248541792b877f98")
    val expected = Bytes.fromHexString("f6ed15a8934afbe7d83e8dcb57fcf5d7")
    assertEquals(expected, CryptoUtils.calculateK1(n, salt, p))
}
```

Document the spec section in a comment when using test vectors.

## Private Helpers

For test-local data, use private helpers in the test class:

```kotlin
private fun createTestRemoteZoneState(
    id: Long = 1L,
    nodes: List<RemoteNodeState> = emptyList()
) = RemoteZoneState(id = id, nodes = nodes, ...)
```
