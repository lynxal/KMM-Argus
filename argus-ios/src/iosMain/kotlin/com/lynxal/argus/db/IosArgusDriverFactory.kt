package com.lynxal.argus.db

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

/**
 * iOS implementation of [ArgusDriverFactory] backed by SQLDelight's
 * [NativeSqliteDriver]. The driver places the database file in the app's default
 * sandboxed location (Documents directory), keyed by [DB_NAME].
 */
public class IosArgusDriverFactory : ArgusDriverFactory {
    override fun create(): SqlDriver = NativeSqliteDriver(ArgusDatabase.Schema, DB_NAME)

    private companion object {
        const val DB_NAME = "argus.db"
    }
}
