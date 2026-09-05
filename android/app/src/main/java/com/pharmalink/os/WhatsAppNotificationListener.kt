package com.pharmalink.os

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.os.Bundle
import java.security.MessageDigest

class WhatsAppNotificationListener : NotificationListenerService() {
    private lateinit var db: LiveEventDb

    override fun onListenerConnected() {
        super.onListenerConnected()
        db = LiveEventDb(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!::db.isInitialized) db = LiveEventDb(applicationContext)
        if (sbn.packageName != PKG_WHATSAPP && sbn.packageName != PKG_WHATSAPP_BUSINESS) return
        val n = sbn.notification ?: return
        if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

        val data = extract(n.extras)
        if (data.text.isBlank()) return
        if (!SourceFilter(applicationContext).allows(data.conversation, data.sender)) return

        val key = sha256(listOf(sbn.packageName, sbn.tag ?: "", sbn.id.toString(), data.conversation ?: "", data.sender ?: "", data.text).joinToString("|"))
        db.enqueue(key, sbn.packageName, data.conversation, data.sender, data.text, sbn.postTime)
        LiveWebBridge.drainIfAlive()
    }

    private fun extract(extras: Bundle): Extracted {
        val conversation = first(extras,
            Notification.EXTRA_CONVERSATION_TITLE,
            Notification.EXTRA_TITLE,
            Notification.EXTRA_SUB_TEXT
        )
        var sender: String? = first(extras, Notification.EXTRA_TITLE)
        var text = first(extras, Notification.EXTRA_BIG_TEXT, Notification.EXTRA_TEXT)

        val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
        if (!messages.isNullOrEmpty()) {
            val latest = messages.lastOrNull() as? Bundle
            if (latest != null) {
                text = latest.getCharSequence("text")?.toString() ?: text
                sender = latest.getCharSequence("sender")?.toString() ?: sender
            }
        }
        return Extracted(conversation, sender, text.orEmpty())
    }

    private fun first(extras: Bundle, vararg keys: String): String? = keys.asSequence()
        .mapNotNull { extras.getCharSequence(it)?.toString()?.trim()?.takeIf(String::isNotEmpty) }
        .firstOrNull()

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray())
        .joinToString("") { "%02x".format(it) }

    data class Extracted(val conversation: String?, val sender: String?, val text: String)

    companion object {
        const val PKG_WHATSAPP = "com.whatsapp"
        const val PKG_WHATSAPP_BUSINESS = "com.whatsapp.w4b"
    }
}
