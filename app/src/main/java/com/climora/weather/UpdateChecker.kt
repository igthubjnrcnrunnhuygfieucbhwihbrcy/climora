package com.climora.weather

import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import androidx.appcompat.app.AlertDialog
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object UpdateChecker {

    const val UPDATE_URL =
        "https://raw.githubusercontent.com/igthubjnrcnrunnhuygfieucbhwihbrcy/climora/main/update/update.json"

    private const val PREFS_NAME = "climora_updates"
    private const val KEY_LAST_WHATS_NEW = "climora_last_whats_new_version"
    private const val CONNECT_TIMEOUT_MS = 5000
    private const val READ_TIMEOUT_MS = 5000

    fun checkOnStartup(activity: Activity, currentVersionCode: Int, currentVersionName: String) {
        val prefs: SharedPreferences =
            activity.getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE)
        Thread {
            val meta = fetchMeta()
            activity.runOnUiThread {
                if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                when {
                    meta != null && meta.optInt("versionCode", 0) > currentVersionCode ->
                        showUpdateDialog(activity, meta)

                    meta != null ->
                        showWhatsNewIfNeeded(activity, prefs, currentVersionCode, meta)

                    else -> Unit
                }
            }
        }.start()
    }

    private fun fetchMeta(): JSONObject? = try {
        val connection = URL(UPDATE_URL).openConnection() as HttpURLConnection
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.setRequestProperty("Cache-Control", "no-cache")
        val body = connection.inputStream.bufferedReader().use { it.readText() }
        JSONObject(body)
    } catch (e: Exception) {
        null
    }

    private fun showUpdateDialog(activity: Activity, meta: JSONObject) {
        val version = meta.optString("versionName", "")
        val message = buildMessage(meta)
        AlertDialog.Builder(activity, R.style.Theme_Climora_Dialog)
            .setTitle(activity.getString(R.string.update_available_title, version))
            .setMessage(message)
            .setPositiveButton(R.string.update_now) { _, _ ->
                val url = meta.optString("downloadUrl", "")
                if (url.isNotBlank()) {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            }
            .setNegativeButton(R.string.update_later, null)
            .show()
    }

    private fun showWhatsNewIfNeeded(
        activity: Activity,
        prefs: SharedPreferences,
        currentVersionCode: Int,
        meta: JSONObject
    ) {
        if (prefs.getInt(KEY_LAST_WHATS_NEW, -1) >= currentVersionCode) return
        val features = meta.optJSONArray("features") ?: return
        if (features.length() == 0) {
            prefs.edit().putInt(KEY_LAST_WHATS_NEW, currentVersionCode).apply()
            return
        }
        prefs.edit().putInt(KEY_LAST_WHATS_NEW, currentVersionCode).apply()
        AlertDialog.Builder(activity, R.style.Theme_Climora_Dialog)
            .setTitle(activity.getString(R.string.whats_new_title))
            .setMessage(buildMessage(meta))
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun buildMessage(meta: JSONObject): String {
        val builder = StringBuilder()
        val changelog = meta.optString("changelog", "")
        if (changelog.isNotBlank()) {
            builder.append(changelog).append("\n\n")
        }
        val features: JSONArray? = meta.optJSONArray("features")
        if (features != null) {
            for (i in 0 until features.length()) {
                builder.append("\u2022 ").append(features.optString(i, "")).append("\n")
            }
        }
        return builder.toString().trim()
    }
}
