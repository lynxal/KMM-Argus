# SQLDelight Conventions

SQLDelight handles persistent structured data (mesh network, nodes, keys, user profile).

## Schema Files

Location: `lynxmesh_sqldelight/src/commonMain/sqldelight/com/lynxal/`

- One `.sq` file per entity: `Node.sq`, `MeshNetwork.sq`, `Group.sq`
- Generated table class uses **DAO suffix**: `NodeDAO`, `MeshNetworkDAO`
- This distinguishes DB entities from domain entities

## Table Structure

```sql
CREATE TABLE IF NOT EXISTS NodeDAO(
    mesh_uuid TEXT NOT NULL,
    uuid TEXT NOT NULL,
    name TEXT,
    elements TEXT AS List<Element> NOT NULL DEFAULT '[]',
    PRIMARY KEY(mesh_uuid, uuid),
    FOREIGN KEY(mesh_uuid) REFERENCES MeshNetworkDAO(mesh_uuid)
        ON UPDATE CASCADE ON DELETE CASCADE
);
```

- Column names: `snake_case`
- Complex types serialized as `TEXT AS CustomType` with type adapters
- Use composite primary keys where applicable
- Foreign keys with `CASCADE` for parent-child relationships
- Add index definitions for frequently queried columns

## Query Naming

- CRUD pattern: `insertNode`, `getNodeByUuid`, `deleteForNetwork`
- Use named parameters: `:meshUuid`, `:deviceUuid`
- Batch variants: `insertOrReplaceNode`

## Transaction Wrappers (Mandatory)

All DB operations must use transaction utilities for consistent timing and logging:

```kotlin
// For operations returning Result<T>
transactionWithResultWrapper<MyQueries, Data, Result<Data>> {
    // queries here
}

// For fire-and-forget operations
transactionWrapper<MyQueries> {
    // queries here
}
```

These log execution time with microsecond precision via `Clock.System`.

## Driver Configuration

Platform-specific `SqlDriver` creation via expect/actual in:
- `androidMain/.../SqlDriverCreator.android.kt`
- `iosMain/.../SqlDriverCreator.ios.kt`
