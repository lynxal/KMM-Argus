package com.lynxal.argus.model

import kotlin.test.Test
import kotlin.test.assertEquals

class SchemaVersionTest {

    @Test
    fun `ARGUS_SCHEMA_VERSION is 1`() {
        // Guard: bumping this constant is a conscious wire-breaking change. Update
        // HelloPayload consumers and the web UI before changing this expectation.
        assertEquals(1, ARGUS_SCHEMA_VERSION)
    }
}
