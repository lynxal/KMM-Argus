// swift-tools-version:5.9
//
// Argus iOS — Swift Package Manager distribution.
//
// The XCFramework is built by Gradle (`./gradlew :argus-ios:assembleArgus-iosReleaseXCFramework`)
// and published as a release asset on GitHub. To consume Argus from a pure Swift /
// Xcode-only app: File → Add Packages → enter this repo's URL.
//
// SPM has no native build-config gating, so the binary linked here is the same in
// debug and release. Wrap your usage in `#if DEBUG` (or split debug/release schemes)
// so the released app does not link Argus.
//
// Each release updates the `url` (versioned download path) and `checksum` below.

import PackageDescription

let package = Package(
    name: "ArgusIOS",
    platforms: [.iOS(.v14)],
    products: [
        .library(name: "ArgusIOS", targets: ["argus_ios"]),
    ],
    targets: [
        .binaryTarget(
            name: "argus_ios",
            url: "https://github.com/lynxal/argus/releases/download/v0.0.1/argus_ios.xcframework.zip",
            checksum: "PLACEHOLDER_REPLACE_PER_RELEASE"
        ),
    ]
)
