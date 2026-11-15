package com.climora.weather

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class GeoLocation(
    val name: String,
    val latitude: Double,
    val longitude: Double
)

data class CurrentWeather(
    val temperature: Double,
    val apparentTemperature: Double,
    val humidity: Int,
    val windSpeed: Double,
    val weatherCode: Int,
    val description: String,
    val icon: String
)

data class DayForecast(
    val date: String,
    val dayLabel: String,
    val weatherCode: Int,
    val description: String,
    val icon: String,
    val tempMax: Double,
    val tempMin: Double,
    val precipitationProbability: Int
)

object WeatherRepository {

    private const val FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
    private const val GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
    private const val CONNECT_TIMEOUT_MS = 8000
    private const val READ_TIMEOUT_MS = 8000

    fun searchLocation(query: String): GeoLocation? {
        val url = "$GEOCODE_URL?name=${URLEncoder.encode(query, "UTF-8")}&count=1&language=nl&format=json"
        val json = httpGet(url)
        val results = json.optJSONArray("results") ?: return null
        if (results.length() == 0) return null
        val first = results.getJSONObject(0)
        return GeoLocation(
            name = first.optString("name", query),
            latitude = first.getDouble("latitude"),
            longitude = first.getDouble("longitude")
        )
    }

    fun fetchForecast(latitude: Double, longitude: Double): Pair<CurrentWeather, List<DayForecast>> {
        val url = "$FORECAST_URL?latitude=$latitude&longitude=$longitude" +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
            "&forecast_days=16&timezone=auto"
        val json = httpGet(url)
        return Pair(parseCurrent(json), parseDaily(json))
    }

    private fun parseCurrent(json: JSONObject): CurrentWeather {
        val current = json.getJSONObject("current")
        val code = current.optInt("weather_code", 0)
        return CurrentWeather(
            temperature = current.getDouble("temperature_2m"),
            apparentTemperature = current.getDouble("apparent_temperature"),
            humidity = current.optInt("relative_humidity_2m", 0),
            windSpeed = current.optDouble("wind_speed_10m", 0.0),
            weatherCode = code,
            description = describeWeatherCode(code),
            icon = iconForWeatherCode(code)
        )
    }

    private fun parseDaily(json: JSONObject): List<DayForecast> {
        val daily = json.getJSONObject("daily")
        val dates = daily.getJSONArray("time")
        val codes = daily.getJSONArray("weather_code")
        val maxTemps = daily.getJSONArray("temperature_2m_max")
        val minTemps = daily.getJSONArray("temperature_2m_min")
        val precipitation = daily.optJSONArray("precipitation_probability_max")
        val days = mutableListOf<DayForecast>()
        for (i in 0 until dates.length()) {
            val date = dates.getString(i)
            val code = codes.optInt(i, 0)
            days.add(
                DayForecast(
                    date = date,
                    dayLabel = formatDayLabel(date, i),
                    weatherCode = code,
                    description = describeWeatherCode(code),
                    icon = iconForWeatherCode(code),
                    tempMax = maxTemps.getDouble(i),
                    tempMin = minTemps.getDouble(i),
                    precipitationProbability = precipitation?.optInt(i, 0) ?: 0
                )
            )
        }
        return days
    }

    private fun formatDayLabel(date: String, index: Int): String {
        if (index == 0) return "Vandaag"
        return try {
            val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(date)
            if (parsed != null) {
                SimpleDateFormat("EEEE d MMMM", Locale("nl")).format(parsed)
                    .replaceFirstChar { it.uppercase(Locale("nl")) }
            } else {
                date
            }
        } catch (e: Exception) {
            date
        }
    }

    private fun httpGet(urlString: String): JSONObject {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.setRequestProperty("Accept", "application/json")
        val body = connection.inputStream.bufferedReader().use { it.readText() }
        return JSONObject(body)
    }

    fun describeWeatherCode(code: Int): String = when (code) {
        0 -> "Onbewolkt"
        1 -> "Licht bewolkt"
        2 -> "Deels bewolkt"
        3 -> "Bewolkt"
        45, 48 -> "Mist"
        51, 53, 55 -> "Motregen"
        56, 57 -> "Bevriezende motregen"
        61 -> "Lichte regen"
        63 -> "Regen"
        65 -> "Zware regen"
        66, 67 -> "Bevriezende regen"
        71 -> "Lichte sneeuw"
        73 -> "Sneeuw"
        75 -> "Zware sneeuwval"
        77 -> "Sneeuwkorrels"
        80 -> "Lichte regenbuien"
        81 -> "Regenbuien"
        82 -> "Hevige regenbuien"
        85, 86 -> "Sneeuwbuien"
        95 -> "Onweer"
        96, 99 -> "Onweer met hagel"
        else -> "Onbekend"
    }

    fun iconForWeatherCode(code: Int): String = when (code) {
        0 -> "\u2600\uFE0F"
        1 -> "\uD83C\uDF24\uFE0F"
        2 -> "\u26C5"
        3 -> "\u2601\uFE0F"
        45, 48 -> "\uD83C\uDF2B\uFE0F"
        51, 53, 55, 56, 57 -> "\uD83C\uDF26\uFE0F"
        61, 63, 65, 66, 67, 80, 81, 82 -> "\uD83C\uDF27\uFE0F"
        71, 73, 75, 77, 85, 86 -> "\u2744\uFE0F"
        95, 96, 99 -> "\u26C8\uFE0F"
        else -> "\uD83C\uDF24\uFE0F"
    }
}
