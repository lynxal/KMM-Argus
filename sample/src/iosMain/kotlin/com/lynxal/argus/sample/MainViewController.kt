package com.lynxal.argus.sample

import androidx.compose.ui.window.ComposeUIViewController
import com.lynxal.argus.sample.debug.DebugTools
import com.lynxal.argus.sample.debug.DebugToolsImpl
import com.lynxal.argus.sample.ui.App
import platform.UIKit.UIViewController

/**
 * Single entry point Swift calls into. The Xcode app embeds the produced
 * framework and instantiates this view controller from `iOSApp.swift`.
 *
 * Whether [DebugToolsImpl] is the Argus-enabled or Argus-disabled variant is
 * decided at Gradle config time via the `-PargusEnabled=true|false` property,
 * which swaps the `iosArgus(En|Dis)abledMain/` source dir on the `iosMain`
 * source set.
 */
public fun MainViewController(): UIViewController {
    val tools: DebugTools = DebugToolsImpl()
    tools.installLogging()
    val httpClient = tools.buildHttpClient()
    val argusUrl = tools.observeArgusUrl()
    return ComposeUIViewController {
        App(
            httpClient = httpClient,
            argusUrl = argusUrl,
            onPublishCustom = {
                tools.publishCustom(source = "sample", label = "demo", payload = "{\"hello\":\"argus\"}")
            },
            onOkHttpCall = tools::fireOkHttpCall,
            onUrlConnectionCall = tools::fireUrlConnectionCall,
            onCorrelatedPair = { first, second -> tools.fireCorrelatedPair(first, second) },
        )
    }
}
