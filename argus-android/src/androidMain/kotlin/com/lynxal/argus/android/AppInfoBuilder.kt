package com.lynxal.argus.android

import android.content.Context
import android.os.Build
import com.lynxal.argus.model.AppInfo

internal object AppInfoBuilder {
    fun from(context: Context): AppInfo {
        val pkg = context.packageName
        val versionName = runCatching {
            context.packageManager.getPackageInfo(pkg, 0).versionName
        }.getOrNull() ?: "unknown"
        val device = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        return AppInfo(
            pkg = pkg,
            versionName = versionName,
            device = device,
            argusVersion = BuildConfig.ARGUS_VERSION,
        )
    }
}
