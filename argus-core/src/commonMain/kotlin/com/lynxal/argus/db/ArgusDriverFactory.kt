package com.lynxal.argus.db

import app.cash.sqldelight.db.SqlDriver

/**
 * Platform indirection for opening the SQLite driver that backs [ArgusDatabase].
 *
 * Android: implemented by `AndroidArgusDriverFactory` in `:argus-android` (uses
 * `AndroidSqliteDriver` and a Context). iOS: implemented by `IosArgusDriverFactory`
 * in `:argus-ios` (uses SqlDelight's `NativeSqliteDriver`).
 * Tests use an in-memory JDBC driver (`TestArgusDriverFactory` in `jvmTest`).
 *
 * Implementations must apply [ArgusDatabase.Schema] before returning the driver.
 */
public interface ArgusDriverFactory {
    public fun create(): SqlDriver
}
