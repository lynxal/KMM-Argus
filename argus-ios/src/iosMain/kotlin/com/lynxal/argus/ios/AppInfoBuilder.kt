package com.lynxal.argus.ios

import com.lynxal.argus.model.AppInfo
import platform.Foundation.NSBundle
import platform.UIKit.UIDevice

internal object AppInfoBuilder {
    fun build(): AppInfo {
        val bundle = NSBundle.mainBundle
        val pkg = bundle.bundleIdentifier ?: "unknown"
        val versionName = (bundle.infoDictionary?.get("CFBundleShortVersionString") as? String) ?: "unknown"
        val device = with(UIDevice.currentDevice) { "$model $systemVersion".trim() }
        return AppInfo(
            pkg = pkg,
            versionName = versionName,
            device = device,
            argusVersion = ARGUS_VERSION,
        )
    }

    private const val ARGUS_VERSION = "0.1.0"
}
