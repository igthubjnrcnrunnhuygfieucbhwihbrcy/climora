/* ClimoraWeather — i18n: Nederlands, Engels, Duits + eenheden per land */
(function () {
  "use strict";

  const STRINGS = {
    nl: {
      searchPlaceholder: "Zoek een locatie…",
      loading: "Climora haalt weerdata op…",
      loadingCaelia: "CAELIA analyseert dag 17–40…",
      loadingCaptain: "AI Captain verifieert eerdere voorspellingen…",
      errorLoad: "Ophalen van weerdata mislukt. Probeer het opnieuw.",
      errorSearch: "Zoeken mislukt.",
      noResults: "Geen resultaten",
      feelsLike: "Voelt als",
      wind: "Wind",
      humidity: "Vochtigheid",
      pressure: "Druk",
      uvIndex: "UV-index",
      visibility: "Zicht",
      precip: "Neerslag",
      cloudCover: "Bewolking",
      dewPoint: "Dauwpunt",
      hOutdoor: "Buitenleven-score",
      hHourly: "Komende 48 uur",
      hDaily: "Dagverwachting (dag 1–16)",
      hRegime: "Dag 17–40 — CAELIA regime-outlook",
      hRadar: "Live regenradar",
      hAir: "Luchtkwaliteit",
      hCaptain: "AI Captain — geleerde modelgewichten",
      hCaelia: "CAELIA-brein",
      outdoorHint: "Score voor activiteiten buitenshuis (0–10)",
      regimeNote: "Geen publieke modeldata beschikbaar voor dag 17–40. CAELIA genereert deze uit het klimaatprofiel (30 jaar archief), analoge dagen en regime-analyse. Toon als bandbreedte, niet als exacte waarde.",
      today: "Vandaag",
      tomorrow: "Morgen",
      aqi: "AQI (Europa)",
      pm25: "PM2.5",
      pm10: "PM10",
      ozone: "Ozon",
      no2: "NO₂",
      pollen: "Pollen",
      aqiGood: "Goed", aqiFair: "Redelijk", aqiModerate: "Matig",
      aqiPoor: "Slecht", aqiVeryPoor: "Zeer slecht", aqiExtremelyPoor: "Extreem slecht",
      noWarnings: "Geen waarschuwingen actief.",
      captainNoData: "Nog geen leermetingen. De AI Captain verifieert voorspellingen automatisch zodra data beschikbaar komt.",
      captainInsights: "Inzichten (CaptainMemory)",
      weightLearned: "geleerd",
      weightDefault: "standaard",
      samples: "metingen",
      caeliaSource: "Bron: CAELIA (klimaatprofiel + analoge dagen + regime-analyse)",
      caeliaRegimes: "Actieve regimes",
      caeliaAnalogs: "Beste analoge jaren",
      biasApplied: "Bias-correctie toegepast",
      savedLocation: "Locatie bewaard",
      useMyLocation: "Mijn locatie",
      modelSpread: "Modelspreiding (P10–P90)",
      day: "dag",
      days: "dagen",
      privacy: "Privacyverklaring",
      terms: "Gebruiksvoorwaarden",
      verifyDone: "verificaties uitgevoerd",
    },
    en: {
      searchPlaceholder: "Search a location…",
      loading: "Climora is fetching weather data…",
      loadingCaelia: "CAELIA is analysing days 17–40…",
      loadingCaptain: "AI Captain is verifying earlier forecasts…",
      errorLoad: "Failed to fetch weather data. Please try again.",
      errorSearch: "Search failed.",
      noResults: "No results",
      feelsLike: "Feels like",
      wind: "Wind",
      humidity: "Humidity",
      pressure: "Pressure",
      uvIndex: "UV index",
      visibility: "Visibility",
      precip: "Precipitation",
      cloudCover: "Cloud cover",
      dewPoint: "Dew point",
      hOutdoor: "Outdoor score",
      hHourly: "Next 48 hours",
      hDaily: "Daily forecast (day 1–16)",
      hRegime: "Day 17–40 — CAELIA regime outlook",
      hRadar: "Live rain radar",
      hAir: "Air quality",
      hCaptain: "AI Captain — learned model weights",
      hCaelia: "CAELIA brain",
      outdoorHint: "Score for outdoor activities (0–10)",
      regimeNote: "No public model data is available for day 17–40. CAELIA generates it from the climate profile (30-year archive), analogue days and regime analysis. Treat as a range, not an exact value.",
      today: "Today",
      tomorrow: "Tomorrow",
      aqi: "AQI (Europe)",
      pm25: "PM2.5",
      pm10: "PM10",
      ozone: "Ozone",
      no2: "NO₂",
      pollen: "Pollen",
      aqiGood: "Good", aqiFair: "Fair", aqiModerate: "Moderate",
      aqiPoor: "Poor", aqiVeryPoor: "Very poor", aqiExtremelyPoor: "Extremely poor",
      noWarnings: "No active warnings.",
      captainNoData: "No learning samples yet. The AI Captain verifies forecasts automatically as data becomes available.",
      captainInsights: "Insights (CaptainMemory)",
      weightLearned: "learned",
      weightDefault: "default",
      samples: "samples",
      caeliaSource: "Source: CAELIA (climate profile + analogue days + regime analysis)",
      caeliaRegimes: "Active regimes",
      caeliaAnalogs: "Best analogue years",
      biasApplied: "Bias correction applied",
      savedLocation: "Location saved",
      useMyLocation: "My location",
      modelSpread: "Model spread (P10–P90)",
      day: "day",
      days: "days",
      privacy: "Privacy Policy",
      terms: "Terms of Use",
      verifyDone: "verifications performed",
    },
    de: {
      searchPlaceholder: "Ort suchen…",
      loading: "Climora ruft Wetterdaten ab…",
      loadingCaelia: "CAELIA analysiert Tag 17–40…",
      loadingCaptain: "AI Captain prüft frühere Vorhersagen…",
      errorLoad: "Wetterdaten konnten nicht geladen werden. Bitte erneut versuchen.",
      errorSearch: "Suche fehlgeschlagen.",
      noResults: "Keine Ergebnisse",
      feelsLike: "Gefühlt",
      wind: "Wind",
      humidity: "Luftfeuchte",
      pressure: "Luftdruck",
      uvIndex: "UV-Index",
      visibility: "Sicht",
      precip: "Niederschlag",
      cloudCover: "Bewölkung",
      dewPoint: "Taupunkt",
      hOutdoor: "Outdoor-Score",
      hHourly: "Nächste 48 Stunden",
      hDaily: "Tagesvorhersage (Tag 1–16)",
      hRegime: "Tag 17–40 — CAELIA-Regimenausblick",
      hRadar: "Live-Regenradar",
      hAir: "Luftqualität",
      hCaptain: "AI Captain — gelernte Modellgewichte",
      hCaelia: "CAELIA-Gehirn",
      outdoorHint: "Score für Aktivitäten im Freien (0–10)",
      regimeNote: "Für Tag 17–40 ist keine öffentliche Modelldaten verfügbar. CAELIA erzeugt sie aus dem Klimaprofil (30-Jahre-Archiv), analogen Tagen und Regimeanalyse. Als Spanne verstehen, nicht als exakten Wert.",
      today: "Heute",
      tomorrow: "Morgen",
      aqi: "AQI (Europa)",
      pm25: "PM2.5",
      pm10: "PM10",
      ozone: "Ozon",
      no2: "NO₂",
      pollen: "Pollen",
      aqiGood: "Gut", aqiFair: "Mäßig", aqiModerate: "Mittel",
      aqiPoor: "Schlecht", aqiVeryPoor: "Sehr schlecht", aqiExtremelyPoor: "Extrem schlecht",
      noWarnings: "Keine aktiven Warnungen.",
      captainNoData: "Noch keine Lernmessungen. Der AI Captain prüft Vorhersagen automatisch, sobald Daten vorliegen.",
      captainInsights: "Erkenntnisse (CaptainMemory)",
      weightLearned: "gelernt",
      weightDefault: "Standard",
      samples: "Messungen",
      caeliaSource: "Quelle: CAELIA (Klimaprofil + analoge Tage + Regimeanalyse)",
      caeliaRegimes: "Aktive Regimes",
      caeliaAnalogs: "Beste analoge Jahre",
      biasApplied: "Bias-Korrektur angewendet",
      savedLocation: "Ort gespeichert",
      useMyLocation: "Mein Standort",
      modelSpread: "Modellstreuung (P10–P90)",
      day: "Tag",
      days: "Tage",
      privacy: "Datenschutzerklärung",
      terms: "Nutzungsbedingungen",
      verifyDone: "Verifizierungen durchgeführt",
    },
  };

  const WEATHER_CODES = {
    nl: { 0: "Helder", 1: "Overwegend helder", 2: "Deels bewolkt", 3: "Bewolkt", 45: "Mist", 48: "Mist met rijp", 51: "Lichte motregen", 53: "Motregen", 55: "Dichte motregen", 56: "Lichte motregen (ijs)", 57: "Dichte motregen (ijs)", 61: "Lichte regen", 63: "Regen", 65: "Zware regen", 66: "Lichte ijzel", 67: "Zware ijzel", 71: "Lichte sneeuw", 73: "Sneeuw", 75: "Zware sneeuw", 77: "Sneeuwkristallen", 80: "Lichte buien", 81: "Buien", 82: "Zware buien", 85: "Lichte sneeuwbuien", 86: "Zware sneeuwbuien", 95: "Onweer", 96: "Onweer met hagel", 99: "Zwaar onweer met hagel" },
    en: { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Violent showers", 85: "Light snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail" },
    de: { 0: "Klar", 1: "Überwiegend klar", 2: "Teils bewölkt", 3: "Bedeckt", 45: "Nebel", 48: "Reifnebel", 51: "Leichter Nieselregen", 53: "Nieselregen", 55: "Dichter Nieselregen", 56: "Leichter gefrierender Niesel", 57: "Dichter gefrierender Niesel", 61: "Leichter Regen", 63: "Regen", 65: "Starker Regen", 66: "Leichter Eisregen", 67: "Starker Eisregen", 71: "Leichter Schneefall", 73: "Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel", 80: "Leichte Schauer", 81: "Schauer", 82: "Heftige Schauer", 85: "Leichte Schneeschauer", 86: "Starke Schneeschauer", 95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Schweres Gewitter mit Hagel" },
  };

  const LOCALES = { nl: "nl-NL", en: "en-GB", de: "de-DE" };

  /* Taal: handmatige keuze > subdomein (nl.climora.com = NL) > browsertaal */
  function langFromHostname() {
    const sub = location.hostname.split(".")[0].toLowerCase();
    if (["nl", "en", "de"].includes(sub)) return sub;
    if (location.hostname.endsWith(".nl")) return "nl";
    if (location.hostname.endsWith(".de") || location.hostname.endsWith(".at") || location.hostname.endsWith(".ch")) return "de";
    return null;
  }

  let lang = localStorage.getItem("climora_lang") ||
    langFromHostname() ||
    (["nl", "en", "de"].includes((navigator.language || "nl").slice(0, 2)) ? navigator.language.slice(0, 2) : "nl");

  function setLang(l) {
    lang = l;
    localStorage.setItem("climora_lang", l);
  }

  function t(key) {
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.nl[key] || key;
  }

  function weatherLabel(code) {
    return (WEATHER_CODES[lang] && WEATHER_CODES[lang][code]) || WEATHER_CODES.nl[code] || "—";
  }

  function locale() { return LOCALES[lang] || "nl-NL"; }

  /* Eenheden per land van de locatie (graden C/F, km/u vs mph) */
  function unitsForCountry(cc) {
    if (cc === "US" || cc === "LR" || cc === "MM") {
      return { temp: "°F", wind: "mph", precip: "inch", convertTemp: c => c * 9 / 5 + 32, convertWind: k => k * 0.621371, convertPrecip: m => m / 25.4, dec: 1 };
    }
    return { temp: "°C", wind: "km/u", precip: "mm", convertTemp: c => c, convertWind: k => k * 3.6, convertPrecip: m => m, dec: 1 };
  }

  window.ClimoraI18N = { get lang() { return lang; }, setLang, t, weatherLabel, locale, unitsForCountry };
})();
