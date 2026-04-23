# Component Library

Two component modules exist: `ui_components` (V1) and `ui_components_v2` (V2).

## Use V2 for All New Code

Module: `ui_components_v2`
Package: `com.lynxal.ui_components_v2`

### V2 Directory Structure

```
ui_components_v2/
  primitives/   # Atomic elements: Button, TextInput, Icon
  components/   # Composite: Dialog, ControlView, Card
  view/         # Screen Views receiving (uiState, onUiAction)
  entity/
    state/      # UiState sealed classes
    action/     # UiAction sealed classes
    vo/         # View Objects for passing state
  modifiers/    # Custom Compose modifiers (shadows, effects)
  theme/        # Theme configuration
  utils/        # Utility functions
```

### UI Hierarchy

```
Screen → Screen View → View Components
```

- **Screen** — Wires DI, navigation, state collection (see screen-composition.md)
- **Screen View** — Full-screen composable in `view/`. Receives `(uiState, onUiAction)`.
  Uses VOs from `entity/vo/` for state.
- **View Components** — Reusable pieces in `primitives/` and `components/`.
  No state awareness — receive only direct props.

### Rules

- Views must be pure composables: no DI, no navigation, no side effects
- VOs carry state from Screen to Screen View
- Components/primitives receive only direct props (not VOs)

## V1 (Legacy)

Module: `ui_components`
Package: `com.lynxal.ui.components`

- V1 remains until old UI screens are fully removed
- Do not add new components to V1
- Migrate V1 components to V2 when the screens using them are rewritten

## Warning: `com.lynxal.ui.view.v2`

The `v2` folder inside `ui_components` module (`com.lynxal.ui.view.v2`) is **not** part of the V2 component library. It is legacy V1 code. The actual V2 library is the `ui_components_v2` module.
