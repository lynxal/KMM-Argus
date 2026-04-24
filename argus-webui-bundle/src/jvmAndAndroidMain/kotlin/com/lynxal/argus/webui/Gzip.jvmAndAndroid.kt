package com.lynxal.argus.webui

import java.util.zip.GZIPInputStream

internal actual fun gunzip(bytes: ByteArray): ByteArray =
    GZIPInputStream(bytes.inputStream()).use { it.readBytes() }
