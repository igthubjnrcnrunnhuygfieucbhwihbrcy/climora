package com.climora.weather

import android.annotation.SuppressLint
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var progressBar: ProgressBar
    private lateinit var errorText: TextView
    private lateinit var contentGroup: LinearLayout
    private lateinit var locationText: TextView
    private lateinit var tempText: TextView
    private lateinit var conditionText: TextView
    private lateinit var detailsText: TextView
    private lateinit var forecastList: RecyclerView
    private lateinit var searchInput: EditText

    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = getSharedPreferences("climora_app", MODE_PRIVATE)

        progressBar = findViewById(R.id.progress_bar)
        errorText = findViewById(R.id.error_text)
        contentGroup = findViewById(R.id.content_group)
        locationText = findViewById(R.id.location_text)
        tempText = findViewById(R.id.temp_text)
        conditionText = findViewById(R.id.condition_text)
        detailsText = findViewById(R.id.details_text)
        forecastList = findViewById(R.id.forecast_list)
        searchInput = findViewById(R.id.search_input)

        forecastList.layoutManager = LinearLayoutManager(this)
        forecastList.isNestedScrollingEnabled = false
        forecastList.adapter = DayAdapter(emptyList())

        findViewById<Button>(R.id.search_button).setOnClickListener {
            val query = searchInput.text.toString().trim()
            if (query.isNotEmpty()) searchAndLoad(query)
        }

        checkForUpdates()
        loadSavedOrSearch()
    }

    private fun loadSavedOrSearch() {
        val saved = prefs.getString("climora_selected_location", null)
        if (saved != null) {
            val parts = saved.split("|")
            if (parts.size == 3) {
                renderLocation(parts[0], parts[1].toDouble(), parts[2].toDouble())
                return
            }
        }
        searchAndLoad(DEFAULT_LOCATION_NAME)
    }

    private fun searchAndLoad(query: String) {
        setLoading(true)
        executor.execute {
            try {
                val geo = WeatherRepository.searchLocation(query)
                    ?: throw IllegalStateException(getString(R.string.error_location_not_found))
                saveLocation(geo)
                val forecast = WeatherRepository.fetchForecast(geo.latitude, geo.longitude)
                runOnUiThread {
                    setLoading(false)
                    showForecast(geo.name, forecast.first, forecast.second)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    errorText.text = e.message ?: getString(R.string.error_generic)
                    errorText.visibility = View.VISIBLE
                    contentGroup.visibility = View.GONE
                }
            }
        }
    }

    private fun renderLocation(name: String, lat: Double, lon: Double) {
        setLoading(true)
        executor.execute {
            try {
                val forecast = WeatherRepository.fetchForecast(lat, lon)
                runOnUiThread {
                    setLoading(false)
                    showForecast(name, forecast.first, forecast.second)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    errorText.text = e.message ?: getString(R.string.error_generic)
                    errorText.visibility = View.VISIBLE
                    contentGroup.visibility = View.GONE
                }
            }
        }
    }

    private fun showForecast(location: String, current: CurrentWeather, days: List<DayForecast>) {
        errorText.visibility = View.GONE
        contentGroup.visibility = View.VISIBLE
        locationText.text = location
        tempText.text = getString(R.string.temp_celsius, current.temperature.toInt())
        conditionText.text = "${current.icon} ${current.description}"
        detailsText.text = getString(
            R.string.current_details,
            current.apparentTemperature.toInt(),
            current.humidity,
            current.windSpeed.toInt()
        )
        forecastList.adapter = DayAdapter(days)
    }

    private fun saveLocation(geo: GeoLocation) {
        prefs.edit()
            .putString("climora_selected_location", "${geo.name}|${geo.latitude}|${geo.longitude}")
            .apply()
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        if (loading) {
            contentGroup.visibility = View.GONE
            errorText.visibility = View.GONE
        }
    }

    private fun checkForUpdates() {
        val versionCode = try {
            val info = packageManager.getPackageInfo(packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                info.versionCode
            }
        } catch (e: Exception) {
            1
        }
        val versionName = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
        UpdateChecker.checkOnStartup(this, versionCode, versionName)
    }

    @SuppressLint("MissingSuperCall")
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (searchInput.text.isNotEmpty()) {
            searchInput.setText("")
            loadSavedOrSearch()
        } else {
            finish()
        }
    }

    companion object {
        const val DEFAULT_LOCATION_NAME = "Amsterdam"
    }
}
