# Crypto Conventions

## Platform Architecture (expect/actual)

Crypto operations use Kotlin Multiplatform's expect/actual pattern:

- `AbstractCryptoUtils` — shared derivation logic (K1–K4, salt,
  network ID, AID). Lives in commonMain.
- `CryptoUtils` (expect/actual) — platform-specific primitives
  (AES, CMAC, ECDH, CCM). Android and iOS provide separate
  implementations.

New crypto operations that combine existing primitives go in
`AbstractCryptoUtils`. New platform-specific primitives require
an `expect` declaration + `actual` implementations for both
Android and iOS (SwiftCryptoBackend).

```
AbstractCryptoUtils (shared derivation)
  └─ calculateK1(), calculateK2(), calculateK3(), calculateK4()
  └─ calculateSalt(), calculateNetworkId(), calculateAid()
  └─ encryptCCM(), decryptCCM() (delegates to platform)

CryptoUtils (expect/actual platform primitives)
  └─ calculateCMAC(), encryptAES(), generateKeyPair()
  └─ generateECDHSharedSecret()
```

## CryptoKeys Enum

CryptoKeys is a **closed set** derived from the Bluetooth Mesh
specification. No new entries are expected.

```kotlin
enum class CryptoKeys(customBytes: Bytes? = null) {
    SMK2,  // -> "smk2".toByteArray()
    ID64,  // -> "id64".toByteArray()
    NKIK,  // -> "nkik".toByteArray()
    // ...
    SALT_KEY(Bytes(ByteArray(16) { 0x00 }, BIG_ENDIAN)),  // friendly name
    PADDING_HASH(Bytes(ByteArray(6) { 0x00 }, BIG_ENDIAN)); // friendly name
}
```

Rules:
- Most entries: name lowercased → ASCII byte array (per BT Mesh spec)
- `SALT_KEY`, `PADDING_HASH`: friendly names with explicit custom bytes
- Do not modify without consulting the Bluetooth Mesh specification

## K-Function Results

| Function | Returns | Outputs |
|----------|---------|--------|
| K1 | `K1Result(t)` | Single derived key |
| K2 | `K2Result(t1, t2, t3)` | NID, encryption key, privacy key |
| K3 | `K3Result(t)` | Single derived key |
| K4 | `K4Result(t)` | Single derived key |
