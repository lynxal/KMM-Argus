# Module Boundaries

## Module Hierarchy (dependencies flow downward only)

```
shared (app layer: screens, use cases, DI, repositories)
├── common_ui (theme, shared UI domain)
│   └── common
├── ui_components / ui_components_v2 (reusable Compose components)
│   ├── common
│   ├── common_ui
│   └── analytics
├── lynxmesh (Bluetooth Mesh protocol: crypto, transport, messages)
│   └── common
├── lynxmesh_sqldelight (SQLDelight database for mesh data)
├── lynxmesh_kable (BLE communication via Kable library)
│   └── common
├── lynxmesh_localstorage (key-value storage abstraction)
├── common (core types, utilities, shared entities)
└── analytics (analytics abstraction)
```

## What Goes Where

| Module | Contains | Does NOT contain |
|--------|----------|-----------------|
| `common` | Core types, utilities, base entities, `MultiplatformSerializable` | Business logic, UI, platform SDKs |
| `lynxmesh` | Mesh protocol, crypto, transport, message hierarchy | App-level logic, UI, storage |
| `lynxmesh_*` | Isolated platform adapters (SQL, BLE, local storage) | Mesh protocol logic |
| `common_ui` | Theme, colors, shared UI domain entities | Screens, navigation |
| `ui_components` | Reusable Compose components, design system | Business logic, screen-level state |
| `shared` | Screens, use cases, repositories, DI, navigation | Nothing — top-level module |
| `analytics` | Analytics interface and events | Platform SDK implementations (those go in androidMain/iosMain) |

## Rules

- **Dependencies are strictly one-way** — lower modules never depend on higher ones
- **Separate modules for platform-specific adapters** — isolate platform dependencies (e.g., `lynxmesh_localstorage` keeps `SharedPreferences`/`NSUserDefaults` out of `lynxmesh`)
- **`common` has zero internal module dependencies** — it's the foundation
- **New reusable UI → `ui_components`**; new screens → `shared/ui/screen/`
