package com.lynxal.argus.model

import kotlinx.serialization.Serializable

/**
 * Top of the event schema. Every signal Argus ships over the wire is an [ArgusEvent].
 *
 * The hierarchy is a sealed interface with `@SerialName`-stamped subclasses, serialized
 * polymorphically by kotlinx.serialization using the default `"type"` class discriminator.
 * The [source] property is a coarse domain tag (useful for filter UIs without decoding to a
 * concrete subtype); it intentionally overlaps with the discriminator.
 *
 * Subclasses live in sibling files: [HttpEvent], [LogEvent], [CustomEvent].
 */
@Serializable
public sealed interface ArgusEvent {
    public val id: String
    public val timestamp: Long
    public val source: EventSource
}
