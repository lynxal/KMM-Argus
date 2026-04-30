@file:OptIn(InternalArgusApi::class)

package com.lynxal.argus.ktor

import com.lynxal.argus.capture.CapturedRequest
import com.lynxal.argus.capture.InternalArgusApi
import io.ktor.util.AttributeKey

internal val ArgusIdKey: AttributeKey<String> = AttributeKey("ArgusId")
internal val ArgusStartMsKey: AttributeKey<Long> = AttributeKey("ArgusStartMs")
internal val ArgusRequestSnapshotKey: AttributeKey<CapturedRequest> = AttributeKey("ArgusRequestSnapshot")
internal val ArgusEmittedKey: AttributeKey<Boolean> = AttributeKey("ArgusEmitted")
internal val ArgusCorrelationKey: AttributeKey<String> = AttributeKey("ArgusCorrelationId")
internal val ArgusMaxBodyBytesKey: AttributeKey<Long> = AttributeKey("ArgusMaxBodyBytes")
