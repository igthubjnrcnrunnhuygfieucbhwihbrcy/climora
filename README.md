# Climora

**Android weer-app** — actueel weer, 16-daagse voorspelling en automatische update-meldingen.

## Functies

- Actueel weer (temperatuur, gevoelstemperatuur, luchtvochtigheid, wind) via Open-Meteo
- 16-daagse voorspelling met neerslagkans
- Locatie zoeken en opslaan (Open-Meteo Geocoding)
- **Update-pop-up bij elke start van de app**: controleert op een nieuwere versie met changelog en nieuwe functies, met knop "Nu updaten". Bij een nieuwe installatie verschijnt een "Nieuw in Climora"-pop-up met de nieuwste functies.

## APK bouwen

De APK wordt automatisch gebouwd door GitHub Actions (workflow `Android APK`).
Download het artifact `climora-apk` van de laatste workflow-run; hierin zitten:

- `app-debug.apk` — direct installeerbaar
- `app-release-unsigned.apk` — voor ondertekende releases

Lokaal bouwen kan ook (JDK 17 + Android SDK vereist):

```bash
gradle assembleDebug
```

## Update-mechanisme

Bij elke start controleert de app `update/update.json`:

```json
{
  "versionCode": 1,
  "versionName": "1.0.0",
  "changelog": "...",
  "features": ["..."],
  "downloadUrl": "https://github.com/.../releases"
}
```

Een update-pop-up verschijnt zodra `versionCode` in het bestand hoger is dan de
geïnstalleerde `versionCode` (in `app/build.gradle.kts`). Voor een release:

1. Verhoog `versionCode` en `versionName` in `app/build.gradle.kts`.
2. Werk `update/update.json` bij met het nieuwe `versionCode`, changelog en functies.
3. Zet de nieuwe APK op de `downloadUrl` (bijv. GitHub Releases).

De URL staat in `UpdateChecker.UPDATE_URL` en kan worden aangepast aan de
gewenste hosting (raw GitHub, eigen server, enz.).

## Structuur

```
app/src/main/java/com/climora/weather/
├── MainActivity.kt        # Scherm, locatie-opslag, laden van data
├── UpdateChecker.kt       # Update-pop-up + "Nieuw in Climora" bij elke start
├── WeatherRepository.kt   # Open-Meteo forecast + geocoding + WMO-codes
└── DayAdapter.kt          # Lijstweergave van de dagvoorspelling
```

## Licentie

MIT
