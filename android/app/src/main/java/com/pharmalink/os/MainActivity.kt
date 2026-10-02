package com.pharmalink.os

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.net.URLConnection
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var db: LiveEventDb
    private lateinit var webView: WebView
    private lateinit var sourceInput: EditText
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        db = LiveEventDb(this)
        buildUi()
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(244, 246, 251))
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 14, 20, 8)
            setBackgroundColor(Color.rgb(13, 27, 78))
        }
        status = TextView(this).apply { setTextColor(Color.WHITE); textSize = 14f }
        sourceInput = EditText(this).apply {
            hint = "الجروبات/الأشخاص (اتركها فارغة لمراقبة كل WhatsApp)"
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)
            isSingleLine = false
            setText(getSharedPreferences("pharmalink_live", MODE_PRIVATE).getString("sources", ""))
        }
        val save = Button(this).apply { text = "حفظ مصادر المراقبة"; setOnClickListener { saveSources() } }
        val permission = Button(this).apply { text = "تفعيل استقبال WhatsApp"; setOnClickListener { startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")) } }
        bar.addView(status)
        bar.addView(sourceInput, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        bar.addView(save)
        bar.addView(permission)
        root.addView(bar)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    return serveBundledAsset(request.url.toString())
                }
            }
            addJavascriptInterface(NativeBridge(db), "PharmaLinkNative")
        }
        LiveWebBridge.attach(webView)
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        webView.loadUrl("https://appassets.androidplatform.net/assets/pharmalink/index.html")
        updateStatus()
    }

    private fun serveBundledAsset(url: String): WebResourceResponse? {
        val prefix = "https://appassets.androidplatform.net/assets/"
        if (!url.startsWith(prefix)) return null
        val assetPath = url.removePrefix(prefix)
        if (assetPath.isBlank() || assetPath.contains("..")) return null

        return try {
            val stream = assets.open("pharmalink/$assetPath")
            val mime = URLConnection.guessContentTypeFromName(assetPath)
                ?: when {
                    assetPath.endsWith(".js") -> "application/javascript"
                    assetPath.endsWith(".css") -> "text/css"
                    assetPath.endsWith(".html") -> "text/html"
                    assetPath.endsWith(".json") -> "application/json"
                    assetPath.endsWith(".svg") -> "image/svg+xml"
                    else -> "application/octet-stream"
                }
            WebResourceResponse(mime, "UTF-8", stream)
        } catch (_: Exception) {
            null
        }
    }

    private fun saveSources() {
        getSharedPreferences("pharmalink_live", MODE_PRIVATE).edit().putString("sources", sourceInput.text.toString()).apply()
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('pharmalink-sources-updated'));", null)
        Toast.makeText(this, "تم حفظ مصادر المراقبة", Toast.LENGTH_SHORT).show()
        updateStatus()
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
        LiveWebBridge.drainIfAlive()
    }

    override fun onDestroy() {
        LiveWebBridge.detach(webView)
        webView.destroy()
        super.onDestroy()
    }

    private fun updateStatus() {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            .orEmpty()
            .contains(packageName)
        status.text = if (enabled) "🟢 استقبال WhatsApp: مفعل" else "🔴 استقبال WhatsApp: غير مفعل"
    }
}
