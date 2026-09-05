package com.pharmalink.os

import android.content.Context

class SourceFilter(context: Context) {
    private val prefs = context.getSharedPreferences("pharmalink_live", Context.MODE_PRIVATE)

    fun allows(conversation: String?, sender: String?): Boolean {
        val raw = prefs.getString("sources", "").orEmpty()
        if (raw.isBlank()) return true
        val wanted = raw.split("\n", ",", ";").map { it.trim().lowercase() }.filter { it.isNotBlank() }.toSet()
        if (wanted.isEmpty()) return true
        val haystack = listOfNotNull(conversation, sender).joinToString(" ").lowercase()
        return wanted.any { haystack.contains(it) }
    }
}
