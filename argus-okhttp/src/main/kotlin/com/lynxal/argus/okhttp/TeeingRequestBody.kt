package com.lynxal.argus.okhttp

import java.util.concurrent.atomic.AtomicReference
import okhttp3.MediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.Sink
import okio.buffer

/**
 * Wraps an OkHttp [RequestBody] so its bytes can be captured up to [captureMax] without
 * materializing the full body in memory before send. The delegate's bytes pass through
 * to the real network sink in O(byteCount) memory; only the first [captureMax] bytes are
 * retained for the inspector.
 *
 * Retry-safe: OkHttp may call [writeTo] more than once for non-one-shot bodies (redirects,
 * auth retries). The captured snapshot is set via `compareAndSet` so the first successful
 * write wins; later writes don't overwrite it. [captured] returns null until the first
 * `writeTo` completes.
 */
internal class TeeingRequestBody(
    private val delegate: RequestBody,
    private val captureMax: Long,
) : RequestBody() {

    private val ref = AtomicReference<Pair<ByteArray, Long>?>(null)

    val captured: Pair<ByteArray, Long>? get() = ref.get()

    override fun contentType(): MediaType? = delegate.contentType()
    override fun contentLength(): Long = delegate.contentLength()
    override fun isOneShot(): Boolean = delegate.isOneShot()

    override fun writeTo(sink: BufferedSink) {
        val capturing = CapturingSink(sink, captureMax)
        val buffered = capturing.buffer()
        delegate.writeTo(buffered)
        buffered.flush()
        ref.compareAndSet(null, capturing.capturedBytes() to capturing.totalWritten)
    }
}

/**
 * Forwards every write to [real] while copying up to [captureMax] bytes into a private
 * buffer for inspection. `Buffer.copyTo` is non-consuming, so the real sink still
 * receives the full byte stream.
 */
private class CapturingSink(
    real: Sink,
    private val captureMax: Long,
) : ForwardingSink(real) {

    private val captured = Buffer()
    var totalWritten: Long = 0L
        private set

    override fun write(source: Buffer, byteCount: Long) {
        val room = captureMax - captured.size
        if (room > 0) {
            val toCapture = minOf(byteCount, room)
            source.copyTo(captured, 0L, toCapture)
        }
        super.write(source, byteCount)
        totalWritten += byteCount
    }

    fun capturedBytes(): ByteArray = captured.readByteArray()
}
