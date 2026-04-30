package com.lynxal.argus.db

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

/**
 * Android implementation of [ArgusDriverFactory] backed by Android's SQLite via
 * [AndroidSqliteDriver]. Database file lives at the standard
 * `<app data>/databases/argus.db` location and is created lazily on first
 * [ArgusDriverFactory.create] call.
 */
public class AndroidArgusDriverFactory(private val context: Context) : ArgusDriverFactory {
    override fun create(): SqlDriver =
        AndroidSqliteDriver(ArgusDatabase.Schema, context.applicationContext, DB_NAME)

    private companion object {
        const val DB_NAME = "argus.db"
    }
}
