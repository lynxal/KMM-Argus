# Resources

Resources are managed via moko-resources. A future migration to Compose Multiplatform resources is planned.

## Module

All new resources go into `ui_components_v2`.

- Package: `com.lynxal.componentLibraryV2`
- Access via generated `MR` object: `MR.strings.*`, `MR.images.*`, `MR.fonts.*`
- Legacy resources in `ui_components` (`com.lynxal.componentLibrary.MR`) — do not add new resources there

## Resource Locations

```
ui_components_v2/src/commonMain/moko-resources/
  base/strings.xml    # String resources (base locale)
  images/             # SVG and PNG assets
  fonts/              # Font files (.ttf)
```

## String Naming

`snake_case` with required prefix:

| Prefix   | Usage                        | Example                          |
|----------|------------------------------|----------------------------------|
| `label_` | UI labels, buttons           | `label_sign_in`, `label_welcome` |
| `title_` | Screen/dialog titles         | `title_check_your_email_inbox`   |
| `desc_`  | Descriptions, explanatory text | `desc_please_wait`             |

Platform-specific strings add `_android` or `_ios` suffix:
```xml
<string name="label_permissions_ble_step_1_android">...</string>
```

## Image Naming

`snake_case` with required prefix:

| Prefix | Usage             | Example              |
|--------|-------------------|----------------------|
| `ic_`  | Icons             | `ic_arrow_back.svg`  |
| `bg_`  | Background images | `bg_landing@1x.png` |

- SVG preferred for icons
- PNG with scale suffixes (`@1x`, `@2x`) for raster images

## Usage in Compose

```kotlin
import com.lynxal.componentLibraryV2.MR
import dev.icerock.moko.resources.compose.stringResource
import dev.icerock.moko.resources.compose.painterResource
import dev.icerock.moko.resources.compose.fontFamilyResource

// Strings
Text(text = stringResource(MR.strings.label_welcome))

// Images
Icon(painter = painterResource(MR.images.ic_arrow_back))

// Fonts
val fontFamily = fontFamilyResource(MR.fonts.manrope_regular)
```

## Localization

- Currently base locale only (English)
- Platform-specific text handled via `PlatformSpecificTextProvider` (expect/actual)

## Future: Compose Multiplatform Resources

A migration from moko-resources to Compose Multiplatform resources is planned for evaluation. Standards will be updated when this transition occurs.
