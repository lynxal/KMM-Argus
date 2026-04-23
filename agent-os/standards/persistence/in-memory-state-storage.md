# In-Memory State Storage

Use in-memory storage for **time-sensitive, frequently-changing state** (light power levels, connectivity, zone aggregates). This state is always re-fetched from mesh/cloud on app launch — persisted snapshots would be stale.

Persist to disk: credentials (KVault), user profile (SQLDelight), mesh network structure (SQLDelight), and other non-time-sensitive data. Structure data (node definitions, zone membership) changes rarely and enables future offline-first mode.

## Rules

- Inherit `StorageInterface`, implement `suspend fun clearAll()`
- All storage methods must be `suspend`
- Storage instances are **singletons** (registered via Koin `single`)
- Protect all reads/writes with `Mutex.withLock()` — never use `AtomicReference` or `volatile`
- Back cache with `MutableMap<Key, Entity>`

```kotlin
class InMemoryFooStorageImpl : FooStorage {
    private val mutex = Mutex()
    private val cache = mutableMapOf<String, Foo>()

    override suspend fun getFoo(id: String): Foo? =
        mutex.withLock { cache[id] }

    override suspend fun setFoo(foo: Foo) {
        mutex.withLock { cache[foo.id] = foo }
    }

    override suspend fun clearAll() {
        mutex.withLock { cache.clear() }
    }
}
```

## When to persist vs keep in-memory

| Persist (SQLDelight/KVault) | In-Memory |
|---|---|
| Node/device structure | Light power state |
| Zone membership | Connectivity status |
| Credentials, tokens | Zone aggregate state |
| User profile | Remote sync state |
| Mesh network keys | Hub online status |
