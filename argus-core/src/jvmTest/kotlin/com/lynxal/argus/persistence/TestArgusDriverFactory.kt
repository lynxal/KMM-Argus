package com.lynxal.argus.persistence

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.lynxal.argus.db.ArgusDatabase
import com.lynxal.argus.db.ArgusDriverFactory

/**
 * In-memory SQLite driver factory for argus-core JVM tests. Each instance produces a
 * fresh schema-applied database; `close()` on the returned driver tears it down.
 */
internal class TestArgusDriverFactory : ArgusDriverFactory {
    override fun create(): SqlDriver =
        JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also(ArgusDatabase.Schema::create)
}
