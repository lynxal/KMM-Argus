# References for Argus Phase 2

## Similar Implementations

### NoopEventBus — sink fallback pattern

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/NoopEventBus.kt`
- **Relevance:** Mirror this for `NoopEventStore` so persistence-disabled callers pay no cost and the `EventRingBuffer` doesn't need null-checks.
- **Key patterns:** `object` singleton implementing the bus interface with no-op methods.

### ArgusJson — single-source serialization

- **Location:** `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/ArgusJson.kt`
- **Relevance:** Reuse for the persisted `payload TEXT` column. Do not introduce a parallel `Json {}` instance — round-trip must be byte-identical to what the WS route emits.
- **Key patterns:** `Json` configured once with the `ArgusEvent` polymorphic module.

### ArgusAttributes — Ktor attribute key pattern

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusAttributes.kt`
- **Relevance:** Add `ArgusCorrelationKey: AttributeKey<String>` here so the plugin can stash the correlation id captured at `onRequest` and read it back at `emitSuccess` / `emitError`.
- **Key patterns:** Top-level `AttributeKey<T>` constants, one per plugin-managed value.

### EventRingBuffer — single-actor concurrency

- **Location:** `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/buffer/EventRingBuffer.kt`
- **Relevance:** Persistence I/O must not block the actor. Dispatch persistence calls onto `Dispatchers.IO` from the actor's body so the actor stays single-threaded; failures log without dropping the in-memory event.
- **Key patterns:** `Channel.UNLIMITED` inbox, `limitedParallelism(1)` actor, `MutableStateFlow` snapshot fan-out.

### ArgusClientPlugin — capture pipeline shape

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt`
- **Relevance:** Both new features (correlation stamping + `fullBodyHosts`) layer on top of the existing `onRequest` / `receivePipeline` / `Send` hooks. Do not refactor the pipeline — extend in place.
- **Key patterns:** Attribute-based snapshot stash, fan-out via `bus.publish`, idempotent `ArgusEmittedKey` guard.

### ArgusLoggerDelegate — non-suspend logger contract

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt`
- **Relevance:** `LoggerImplementation.log` is non-suspend. Reading the active correlation id requires a `ThreadContextElement` bridge if `LoggerExtras` doesn't expose a context bag.

### sample-android — verification harness

- **Location:** `sample-android/`
- **Relevance:** End-to-end smoke test target. Add a button or auto-fire path that exercises `withCorrelation { httpClient.get(...); Logger.i(...) }` so the round trip is observable in the browser UI.
