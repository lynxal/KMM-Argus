# UiState & UiAction Pattern

Views are pure composables driven by state and actions.

## View Signature

```kotlin
@Composable
fun FeatureView(
    modifier: Modifier = Modifier,
    uiState: FeatureViewUiState,
    onUiAction: (FeatureViewUiAction) -> Unit
)
```

## Naming Convention

- State: `[Feature]ViewUiState`
- Action: `[Feature]ViewUiAction`
- View Object: `[Name]VO` (in `ui_components_v2/entity/vo/`)

## State Rules

```kotlin
sealed class FeatureViewUiState : UiState {
    data object Loading : FeatureViewUiState()
    data class Idle(
        val title: String,
        val items: List<ItemVO>
    ) : FeatureViewUiState()
}
```

- State must be **immutable** — no `MutableState<T>` fields inside state classes
- Use sealed classes for state variants (Loading, Idle, Error)
- Existing `MutableState` fields in state classes are legacy — migrate to immutable when touched

### Immutable state example

```kotlin
// ✔ Correct: immutable fields, changes via actions
data class Idle(
    val firstName: String,
    val email: String
) : AccountViewUiState()

// ✘ Legacy: MutableState inside data class
data class Idle(
    val firstName: MutableState<String>,  // do not do this
    val email: MutableState<String>
) : AccountViewUiState()
```

## Action Rules

```kotlin
sealed class FeatureViewUiAction : UiAction {
    data class OnItemClicked(val id: String) : FeatureViewUiAction()
    data object OnRefresh : FeatureViewUiAction()
}
```

- All user interactions modeled as actions
- Navigation actions flow up to the Screen layer (not handled in View)

## View Objects (VO)

- VOs are UI-facing data holders in `ui_components_v2/entity/vo/`
- `@Serializable` when used in navigation routes
- Examples: `NearbyDeviceVO`, `RoomVO`, `BluetoothLEAdvertisementVO`
- VO ≠ domain entity — VOs are shaped for the UI, not the business layer
