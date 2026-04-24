package com.lynxal.argus.android

import java.net.Inet4Address
import java.net.NetworkInterface

internal object LocalIp {
    fun firstIPv4(): String? {
        val ifaces = runCatching { NetworkInterface.getNetworkInterfaces() }.getOrNull() ?: return null
        for (nif in ifaces) {
            if (nif.isLoopback || !nif.isUp) continue
            for (addr in nif.inetAddresses) {
                if (addr is Inet4Address && !addr.isLoopbackAddress && addr.isSiteLocalAddress) {
                    return addr.hostAddress
                }
            }
        }
        return null
    }
}
