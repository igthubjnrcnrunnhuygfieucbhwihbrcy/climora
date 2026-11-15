package com.climora.weather

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

data class UpdateInfo(
    val latestVersion: String,
    val minVersion: String,
    val title: String,
    val notes: Map<String, String>,
    val url: String
) {
    fun isForceUpdate(currentVersion: String): Boolean {
        if (minVersion.isBlank()) return false
        return UpdateChecker.compareVersions(currentVersion, minVersion) < 0
    }

    fun notesForLocale(context: Context): String {
        val locale = context.resources.configuration.locales[0].language.lowercase()
        return notes[locale]
            ?: notes["nl"]
            ?: notes["en"]
            ?: notes.values.firstOrNull()
            ?: ""
    }
}

object UpdateChecker {

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    fun checkForUpdate(context: Context, callback: (UpdateInfo?) -> Unit) {
        executor.execute {
            val info = fetchUpdateInfo(BuildConfig.UPDATE_URL)
            val result = if (info != null && compareVersions(BuildConfig.VERSION_NAME, info.latestVersion) < 0) info else null
            mainHandler.post { callback(result) }
        }
    }

    private fun fetchUpdateInfo(urlString: String): UpdateInfo? {
        if (urlString.isBlank()) return null
        return try {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.setRequestProperty("Cache-Control", "no-cache")
            connection.instanceFollowRedirects = true
            try {
                if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                parseUpdateInfo(body)
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }

    internal fun parseUpdateInfo(json: String): UpdateInfo? {
        return try {
            val root = JSONObject(json)
            val notes = mutableMapOf<String, String>()
            val notesJson = root.optJSONObject("notes")
            if (notesJson != null) {
                for (key in notesJson.keys()) {
                    notes[key.lowercase()] = notesJson.optString(key, "")
                }
            } else {
                val plain = root.optString("notes", "")
                if (plain.isNotBlank()) notes["en"] = plain
            }
            UpdateInfo(
                latestVersion = root.optString("latestVersion", "").trim(),
                minVersion = root.optString("minVersion", "").trim(),
                title = root.optString("title", "").trim(),
                notes = notes,
                url = root.optString("url", "").trim()
            )
        } catch (_: Exception) {
            null
        }
    }

    internal fun compareVersions(a: String, b: String): Int {
        val pa = a.trim().removePrefix("v").split('.').map { it.trim().toIntOrNull() ?: 0 }
        val pb = b.trim().removePrefix("v").split('.').map { it.trim().toIntOrNull() ?: 0 }
        val length = maxOf(pa.size, pb.size)
        for (i in 0 until length) {
            val va = pa.getOrElse(i) { 0 }
            val vb = pb.getOrElse(i) { 0 }
            if (va != vb) return va.compareTo(vb)
        }
        return 0
    }
}
