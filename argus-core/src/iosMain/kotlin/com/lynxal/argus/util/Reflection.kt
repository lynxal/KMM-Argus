package com.lynxal.argus.util

import com.lynxal.argus.capture.InternalArgusApi
import kotlin.reflect.KClass

@InternalArgusApi
public actual fun KClass<*>.bestEffortFqn(): String =
    simpleName ?: toString()
