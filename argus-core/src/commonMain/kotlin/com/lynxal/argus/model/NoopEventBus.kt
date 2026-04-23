package com.lynxal.argus.model

public object NoopEventBus : ArgusEventBus {
    override fun publish(event: ArgusEvent): Unit = Unit
}
