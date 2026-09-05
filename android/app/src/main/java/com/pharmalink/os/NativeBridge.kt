package com.pharmalink.os

import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

class NativeBridge(private val db: LiveEventDb) {
    @JavascriptInterface
    fun getPendingEvents(): String {
        val array = JSONArray()
        db.pending().forEach { e ->
            array.put(JSONObject().apply {
                put("id", e.id)
                put("eventKey", e.eventKey)
                put("packageName", e.packageName)
                put("conversation", e.conversation ?: JSONObject.NULL)
                put("sender", e.sender ?: JSONObject.NULL)
                put("text", e.text)
                put("receivedAt", e.receivedAt)
            })
        }
        return array.toString()
    }

    @JavascriptInterface
    fun markProcessed(id: Long) = db.markProcessed(id)

    @JavascriptInterface
    fun markFailed(id: Long, error: String) = db.markFailed(id, error)

    @JavascriptInterface
    fun setSources(value: String) {
    }
}
