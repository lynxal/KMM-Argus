# iOS Cinterop (Swift Framework Bridge)

## Overview

Used to bridge Swift code into Kotlin/Native when no KMP library exists.
Currently only `SwiftCryptoBackend` uses this pattern.

## Structure

```
lynxmesh/
  def/SwiftCryptoBackend/
    iosArm64.def              → .def for physical device
    iosSimulatorArm64.def     → .def for simulator
  src/
    iosArm64Main/             → actual impl using cinterop bindings
    iosSimulatorArm64Main/    → actual impl using cinterop bindings
```

## .def File Template

```
package = swift.cryptobackend
language = Objective-C

headers = SwiftCryptoBackend/SwiftCryptoBackend-Swift.h
headerFilter = SwiftCryptoBackend/*

staticLibraries = libSwiftCryptoBackend.a

libraryPaths.ios_arm64 = dependencies/SwiftCrypto/IosArm64
linkerOpts.ios_arm64 = -L/usr/lib/swift
linkerOpts.ios_arm64 = -L/.../usr/lib/swift/iphoneos/
```

## Key Points

- **Separate .def per architecture** — device (iosArm64) and simulator (iosSimulatorArm64) need different library paths and linker opts
- **Swift exposes via Objective-C header** — the `-Swift.h` generated header is what cinterop reads
- **Static library** — compiled Swift is linked as `.a` static lib, stored in `dependencies/`
- **Package mapping** — `package = swift.cryptobackend` determines the Kotlin import path
- Use `expect object` in commonMain with `actual object` in `iosArm64Main`/`iosSimulatorArm64Main` that calls the cinterop bindings
