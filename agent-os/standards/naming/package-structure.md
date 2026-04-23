# Package Structure

## Folder Naming

Use **singular** names for all packages:

```
data/
  repository/      # not repositories/
  storage/
  converter/
domain/
  entity/
  useCase/         # camelCase for multi-word
  service/
remote/
  service/
ui/
  screen/
  model/
  navigation/
utils/               # exception: plural by Kotlin convention
```

- camelCase for multi-word folders: `useCase/`, `remoteState/`
- No abbreviations in folder names

## Nesting Rule

Create a subdirectory at **domain boundaries**:

```
domain/useCase/
  mesh/                    # subdomain: BLE mesh operations
    state/                 # sub-aspect: state setters
    zoneStateRetrieval/    # sub-aspect: zone queries
      delegate/            # pattern: strategy delegates
  remoteState/             # subdomain: cloud state sync
```

- Each distinct subdomain gets its own folder
- Within a subdomain, further split by aspect if the subdomain grows
- Pattern-specific folders (delegate/, command/) go inside their parent feature

## File Organization

One top-level class, interface, or enum per file. The file name must match the class name.

```
// Good
NodeParameter.kt          → data class NodeParameter(...)
NodeParameterResponse.kt  → data class NodeParameterResponse(...)

// Bad — multiple top-level declarations in one file
NodeParameterResponse.kt  → data class NodeParameterGroupResponse(...)
                            data class NodeParameterResponse(...)
```

Exceptions: private helpers or tightly coupled sealed subtypes defined inside the same sealed parent are fine.

## Root Layer Structure

```
com.lynxal.<module>/
  data/          # Storage, repositories, converters
  domain/        # Entities, use cases, services, business logic
  remote/        # HTTP/WebSocket service interfaces and impls
  ui/            # Screens, screen models, navigation
  di/            # Koin module definitions
  utils/         # Shared utilities
```

- `data/` = local state and orchestration
- `remote/` = network communication (separate from data/)
- `domain/` = pure business logic, no platform dependencies
