package com.lynxal.argus.util

import com.lynxal.argus.capture.InternalArgusApi
import kotlin.reflect.KClass

/**
 * Best-effort fully-qualified class name for a [KClass]. JVM/Android return
 * `qualifiedName` (e.g. `java.io.IOException`); Kotlin/Native targets fall back to
 * `simpleName` because Apple targets strip reflection metadata. Used by the capture
 * pipeline to disambiguate exception types in published events.
 */
@InternalArgusApi
public expect fun KClass<*>.bestEffortFqn(): String
