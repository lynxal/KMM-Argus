package com.lynxal.argus.webui

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.UByteVar
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.convert
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.sizeOf
import kotlinx.cinterop.usePinned
import platform.zlib.Z_FINISH
import platform.zlib.Z_OK
import platform.zlib.Z_STREAM_END
import platform.zlib.ZLIB_VERSION
import platform.zlib.inflate
import platform.zlib.inflateEnd
import platform.zlib.inflateInit2_
import platform.zlib.z_stream

@OptIn(ExperimentalForeignApi::class)
internal actual fun gunzip(bytes: ByteArray): ByteArray {
    // ISIZE is the last 4 bytes of a gzip stream, little-endian,
    // giving the uncompressed size mod 2^32. Our bundles are well under
    // 4 GiB so this is exact — used to pre-size the output buffer.
    require(bytes.size >= 18) { "gzip input too short: ${bytes.size}" }
    val iSize = (bytes[bytes.size - 4].toInt() and 0xff) or
        ((bytes[bytes.size - 3].toInt() and 0xff) shl 8) or
        ((bytes[bytes.size - 2].toInt() and 0xff) shl 16) or
        ((bytes[bytes.size - 1].toInt() and 0xff) shl 24)
    require(iSize >= 0) { "implausible ISIZE: $iSize" }

    val dst = ByteArray(iSize)

    memScoped {
        val strm = alloc<z_stream>().apply {
            zalloc = null
            zfree = null
            opaque = null
            avail_in = 0u
            next_in = null
        }

        bytes.usePinned { srcPin ->
            dst.usePinned { dstPin ->
                strm.next_in = srcPin.addressOf(0).reinterpret<UByteVar>()
                strm.avail_in = bytes.size.convert()
                strm.next_out = dstPin.addressOf(0).reinterpret<UByteVar>()
                strm.avail_out = iSize.convert()

                // windowBits = 15 + 32 asks zlib to auto-detect gzip vs zlib wrapping.
                val initRet = inflateInit2_(
                    strm.ptr,
                    15 + 32,
                    ZLIB_VERSION,
                    sizeOf<z_stream>().convert(),
                )
                require(initRet == Z_OK) { "inflateInit2_ failed: $initRet" }

                val ret = inflate(strm.ptr, Z_FINISH)
                val total = strm.total_out.toLong().toInt()
                inflateEnd(strm.ptr)
                require(ret == Z_STREAM_END) { "inflate failed: $ret (total_out=$total)" }
                require(total == iSize) { "decoded size mismatch: $total vs expected $iSize" }
            }
        }
    }
    return dst
}
