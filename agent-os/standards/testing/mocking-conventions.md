# Mocking with Mokkery

Use [Mokkery](https://mokkery.dev) for mocking dependencies in tests.

## Mock Creation

Initialize mocks in `@BeforeTest` with inline configuration:

```kotlin
private lateinit var repository: MeshProxyCommunicationRepository

@BeforeTest
fun setup() {
    repository = mock {
        every { meshApi } returns mock<BluetoothMeshApi>()
        every { deviceConfigurationStorage } returns mock<DeviceConfigurationStorage>()
    }
}
```

## Stubbing

```kotlin
// Synchronous
every { localStorage.getBoolean(any(), any()) } returns true
every { localStorage.putBoolean(any(), any()) } returns Unit

// Suspend functions
everySuspend { storage.getNodeState(any()) } returns nodeState
```

## Verification

```kotlin
verify { repository.saveState(expectedState) }
```

## Matchers

```kotlin
import dev.mokkery.matcher.any

every { storage.getString(any(), any()) } returns "default"
```

## Mock vs Fake

Choose whichever is simpler for the test:
- **Mokkery mock** — quick setup, good for interface dependencies with few method calls
- **Hand-written fake** — better for complex stateful objects (e.g., in-memory storage implementations)

## Coroutine Tests

Wrap async tests with `runTest`:

```kotlin
@Test
fun `zone state updates correctly`() = runTest {
    // Arrange
    val storage = createStorage()

    // Act
    storage.updateZoneState(testZoneState)

    // Assert
    assertEquals(expected, storage.getZoneState(zoneId))
}
```
