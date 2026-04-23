# Test Structure & Naming

## Framework

Use `kotlin.test` for all tests. It's multiplatform-compatible and runs on JVM, Android, and iOS.

```kotlin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.BeforeTest
```

For suspend/coroutine tests, use `kotlinx.coroutines.test.runTest`.

## Test Placement

- **`commonTest`** — default for all tests (runs cross-platform)
- **`androidUnitTest` / `iosTest`** — only for platform-specific implementations (expect/actual, Android Context, iOS frameworks)

Mirror the source package structure in test directories.

## Naming

**Backtick names preferred** for readability:

```kotlin
@Test
fun `encodedId correctly encodes familyId, seriesId, and deviceId`() {
    // ...
}

@Test
fun `node removed from all spaces should become orphaned`() {
    // ...
}
```

Describe the behavior, not the implementation.

## Structure (AAA)

Follow Arrange-Act-Assert:

```kotlin
@Test
fun `K1 derivation matches spec test vector`() {
    // Arrange
    val input = Bytes.fromHexString("3216d1509884b533...")
    val salt = Bytes.fromHexString("2ba14ffa0df84a28...")

    // Act
    val result = CryptoUtils.calculateK1(input, salt)

    // Assert
    assertEquals(expected, result)
}
```

## Setup

Use `@BeforeTest` for shared initialization:

```kotlin
@BeforeTest
fun setup() {
    repository = mock<SomeRepository> { ... }
    useCase = SomeUseCase(repository)
}
```

## Test Class Naming

Suffix with `Test`: `BytesTest`, `IntValidatorTest`, `MeshDeviceDescriptorTest`.
