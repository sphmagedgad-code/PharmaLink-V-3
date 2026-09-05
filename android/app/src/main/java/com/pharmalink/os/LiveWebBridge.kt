package com.pharmalink.os

import android.webkit.WebView
import java.lang.ref.WeakReference

object LiveWebBridge {
    @Volatile private var webViewRef: WeakReference<WebView>? = null

    fun attach(webView: WebView) { webViewRef = WeakReference(webView) }

    fun detach(webView: WebView) {
        if (webViewRef?.get() === webView) webViewRef = null
    }

    fun drainIfAlive() {
        val webView = webViewRef?.get() ?: return
        webView.post {
            webView.evaluateJavascript(
                "window.PharmaLinkLive && window.PharmaLinkLive.drain && window.PharmaLinkLive.drain();",
                null
            )
        }
    }
}
