package com.lynxal.argus.ios

import com.lynxal.argus.model.AppInfo
import com.lynxal.argus.model.ArgusBuildKonfig
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
            argusVersion = ArgusBuildKonfig.ARGUS_VERSION,
        )
    }
}
