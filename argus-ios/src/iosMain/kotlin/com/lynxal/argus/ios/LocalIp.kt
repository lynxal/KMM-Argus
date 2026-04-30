package com.lynxal.argus.ios

import kotlinx.cinterop.ByteVar
import kotlinx.cinterop.CPointer
import kotlinx.cinterop.CPointerVar
import kotlinx.cinterop.alloc
import kotlinx.cinterop.allocArray
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.pointed
import kotlinx.cinterop.ptr
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.toKString
import kotlinx.cinterop.value
import platform.darwin.freeifaddrs
import platform.darwin.getifaddrs
import platform.darwin.ifaddrs
import platform.darwin.inet_ntop
import platform.posix.AF_INET
import platform.posix.IFF_LOOPBACK
import platform.posix.IFF_UP
import platform.posix.sockaddr_in

/**
 * First IPv4 site-local (RFC1918) non-loopback address. Used to render the URL
 * shown in [ArgusHandle.url] so a developer on the same Wi-Fi can open the inspector.
 *
 * Mirrors the behavior of `argus-android`'s `LocalIp.firstIPv4()`, which uses
 * `NetworkInterface.getNetworkInterfaces()` + `Inet4Address.isSiteLocalAddress`.
 */
internal object LocalIp {
    fun firstIPv4(): String? = memScoped {
        val ifap = alloc<CPointerVar<ifaddrs>>()
        if (getifaddrs(ifap.ptr) != 0) return@memScoped null
        try {
            var cur: CPointer<ifaddrs>? = ifap.value
            while (cur != null) {
                val iface = cur.pointed
                val addr = iface.ifa_addr
                val flags = iface.ifa_flags.toInt()
                val family = addr?.pointed?.sa_family?.toInt()
                if (addr != null &&
                    family == AF_INET &&
                    (flags and IFF_UP.toInt()) != 0 &&
                    (flags and IFF_LOOPBACK.toInt()) == 0
                ) {
                    val sin = addr.reinterpret<sockaddr_in>().pointed
                    val buf = allocArray<ByteVar>(INET_ADDRSTRLEN)
                    val ok = inet_ntop(AF_INET, sin.sin_addr.ptr, buf, INET_ADDRSTRLEN.toUInt())
                    if (ok != null) {
                        val ip = buf.toKString()
                        if (isSiteLocal(ip)) return@memScoped ip
                    }
                }
                cur = iface.ifa_next
            }
            null
        } finally {
            freeifaddrs(ifap.value)
        }
    }

    private fun isSiteLocal(ip: String): Boolean {
        val parts = ip.split('.')
        if (parts.size != 4) return false
        val o = IntArray(4) { parts[it].toIntOrNull() ?: return false }
        return when {
            o[0] == 10 -> true
            o[0] == 172 && o[1] in 16..31 -> true
            o[0] == 192 && o[1] == 168 -> true
            else -> false
        }
    }

    private const val INET_ADDRSTRLEN = 16
}
