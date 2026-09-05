package com.pharmalink.os

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.content.ContentValues

class LiveEventDb(context: Context) : SQLiteOpenHelper(context, "pharmalink_live_queue.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_key TEXT NOT NULL UNIQUE,
                package_name TEXT NOT NULL,
                conversation TEXT,
                sender TEXT,
                text TEXT NOT NULL,
                received_at INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'QUEUED',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX idx_events_status_created ON events(status, created_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun enqueue(eventKey: String, packageName: String, conversation: String?, sender: String?, text: String, receivedAt: Long): Long {
        val values = ContentValues().apply {
            put("event_key", eventKey)
            put("package_name", packageName)
            put("conversation", conversation)
            put("sender", sender)
            put("text", text)
            put("received_at", receivedAt)
            put("status", "QUEUED")
            put("created_at", System.currentTimeMillis())
        }
        return writableDatabase.insertWithOnConflict("events", null, values, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun pending(limit: Int = 100): List<LiveEvent> {
        val result = mutableListOf<LiveEvent>()
        readableDatabase.rawQuery(
            "SELECT id,event_key,package_name,conversation,sender,text,received_at,status,attempts,last_error FROM events WHERE status IN ('QUEUED','FAILED') ORDER BY created_at ASC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                result += LiveEvent(
                    c.getLong(0), c.getString(1), c.getString(2), c.getStringOrNull(3),
                    c.getStringOrNull(4), c.getString(5), c.getLong(6), c.getString(7), c.getInt(8), c.getStringOrNull(9)
                )
            }
        }
        return result
    }

    fun markProcessed(id: Long) = updateStatus(id, "PROCESSED", null)

    fun markFailed(id: Long, error: String) {
        writableDatabase.execSQL("UPDATE events SET status='FAILED', attempts=attempts+1, last_error=? WHERE id=?", arrayOf(error.take(1000), id))
    }

    private fun updateStatus(id: Long, status: String, error: String?) {
        writableDatabase.execSQL("UPDATE events SET status=?, last_error=? WHERE id=?", arrayOf(status, error, id))
    }

    private fun android.database.Cursor.getStringOrNull(index: Int): String? = if (isNull(index)) null else getString(index)
}

data class LiveEvent(
    val id: Long,
    val eventKey: String,
    val packageName: String,
    val conversation: String?,
    val sender: String?,
    val text: String,
    val receivedAt: Long,
    val status: String,
    val attempts: Int,
    val lastError: String?
)
