# ClimoraWeather — Android APK

ClimoraWeather als Android-app: een snelle WebView-container rond de Climora
web-app, met een **update-pop-up die bij elke app-start controleert op nieuwe
versies en functies**.

## Update-pop-up

Bij **elke keer dat de app opstart** haalt `UpdateChecker` een JSON-manifest op
en toont hij, als er een nieuwere versie is, een pop-up met "Nieuw in deze
versie" en een knop **Nu updaten**.

Manifest-formaat (zie [`updates.json`](updates.json)):

```json
{
  "latestVersion": "1.1.0",
  "minVersion": "1.0.0",
  "title": "ClimoraWeather update",
  "notes": { "nl": "...", "en": "...", "de": "..." },
  "url": "https://github.com/.../releases/latest"
}
```

- `latestVersion` hoger dan de geïnstalleerde versie → pop-up tonen.
- Geïnstalleerde versie lager dan `minVersion` → **geforceerde update**:
  pop-up is niet weg te klikken behalve via "Nu updaten".
- `notes` wordt getoond in de taal van het toestel (NL/EN/DE).
- Geen internet of een ongeldig manifest → geen pop-up, de app start gewoon.

## Configuratie

Staat in `gradle.properties`:

| Property | Betekenis | Standaard |
|---|---|---|
| `CLIMORA_APP_URL` | URL van de Climora web-app (Base44) | `https://climora.base44.app` |
| `CLIMORA_UPDATE_URL` | URL van het update-manifest | `https://climora.base44.app/updates.json` |

De app-versie staat in `app/build.gradle` (`versionCode` / `versionName`) en
moet gelijk oplopen met `latestVersion` in het manifest.

## APK bouwen

### Optie 1 — GitHub Actions (automatisch, geen installatie)

De workflow `.github/workflows/build-apk.yml` bouwt bij elke push een
**debug- en release-APK**:

1. Open het tabblad **Actions** van de repository.
2. Kies de run **Build ClimoraWeather APK**.
3. Download onder **Artifacts** `ClimoraWeather-debug-apk` of
   `ClimoraWeather-release-apk`.
4. Kopieer de `.apk` naar een Android-toestel en installeer
   ("Onbekende bronnen" toestaan).

### Optie 2 — Lokaal met Android Studio

1. Open de repositorymap in Android Studio.
2. `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
3. De APK staat in `app/build/outputs/apk/debug/`.

### Optie 3 — Command line

```bash
gradle assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
gradle assembleRelease   # app/build/outputs/apk/release/app-release-unsigned.apk
```

## Architectuur

```
MainActivity (WebView, pull-to-refresh, back-navigatie)
   ├── laadt BuildConfig.APP_URL bij start
   └── UpdateChecker.checkForUpdate() bij ELKE start
         ├── fetch BuildConfig.UPDATE_URL (8 s timeout, geen extra dependencies)
         ├── semver-vergelijking met BuildConfig.VERSION_NAME
         └── AlertDialog met release notes (NL/EN/DE) + updateknop
```

- Minimaal Android 7.0 (API 24), doel API 34.
- Locatie- en internetrechten aangevraagd voor GPS-detectie en weerdata.
- Cleartext-verkeer alleen toegestaan voor `climora.local` (RPi5 thuisserver).

## Licentie

MIT
