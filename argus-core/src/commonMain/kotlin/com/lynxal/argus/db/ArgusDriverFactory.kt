package com.lynxal.argus.db

import app.cash.sqldelight.db.SqlDriver

/**
 * Platform indirection for opening the SQLite driver that backs [ArgusDatabase].
 *
 * Android: implemented by `AndroidArgusDriverFactory` in `:argus-android` (uses
 * `AndroidSqliteDriver` and a Context). iOS will arrive in Phase 4 with `:argus-ios`.
 * Tests use an in-memory JDBC driver (`TestArgusDriverFactory` in `jvmTest`).
 *
 * Implementations must apply [ArgusDatabase.Schema] before returning the driver.
 */
public interface ArgusDriverFactory {
    public fun create(): SqlDriver
}
