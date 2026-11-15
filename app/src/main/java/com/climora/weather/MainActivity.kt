package com.climora.weather

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        swipeRefresh = findViewById(R.id.swipe_refresh)
        progressBar = findViewById(R.id.progress_bar)

        setupWebView()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(BuildConfig.APP_URL)
        }

        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        UpdateChecker.checkForUpdate(this) { update ->
            update?.let { showUpdateDialog(it) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                return if (url.startsWith("http://") || url.startsWith("https://")) {
                    view.loadUrl(url)
                    false
                } else {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    } catch (_: Exception) {
                    }
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                swipeRefresh.isRefreshing = false
                progressBar.visibility = View.GONE
            }
        }

        webView.webChromeClient = WebChromeClient()

        webView.setOnLongClickListener { true }
    }

    private fun showUpdateDialog(update: UpdateInfo) {
        val notes = update.notesForLocale(this)
        val force = update.isForceUpdate(BuildConfig.VERSION_NAME)

        val builder = AlertDialog.Builder(this)
            .setTitle(update.title.ifBlank { getString(R.string.update_title) })
            .setMessage(notes.ifBlank { getString(R.string.update_default_notes) })
            .setPositiveButton(R.string.update_action) { _, _ -> openUpdateUrl(update) }

        if (force) {
            builder.setCancelable(false)
                .setNegativeButton(R.string.update_close_app) { _, _ -> finishAffinity() }
        } else {
            builder.setNegativeButton(R.string.update_later, null)
        }

        builder.show()
    }

    private fun openUpdateUrl(update: UpdateInfo) {
        val url = update.url
        if (url.isBlank()) {
            Toast.makeText(this, R.string.update_no_url, Toast.LENGTH_SHORT).show()
            if (update.isForceUpdate(BuildConfig.VERSION_NAME)) finishAffinity()
            return
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            Toast.makeText(this, R.string.update_no_url, Toast.LENGTH_SHORT).show()
        }
        if (update.isForceUpdate(BuildConfig.VERSION_NAME)) finishAffinity()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
