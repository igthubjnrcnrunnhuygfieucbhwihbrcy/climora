# ClimoraWeather

**AI-gestuurde weerwebsite, volledig in eigen beheer.** Voorspellingen tot 40 dagen vooruit met multi-model consensus, een gesloten leerlus (AI Captain) en een eigen lange-termijnlaag (CAELIA). Geen accounts, geen API-sleutels, geen build-stap.

## Kenmerken

| Laag | Wat het doet |
|------|--------------|
| Multi-model forecast | ECMWF IFS, DWD ICON, NOAA GFS en MET Norway, gewogen gecombineerd (dag 1–16) |
| Onzekerheidsband | Modelspreiding als P10–P90-band per dag |
| CAELIA | Dag 17–40 uit klimaatprofiel (30 jaar archief), analoge dagen en regime-analyse — als bandbreedte, nooit schijnprecisie |
| AI Captain | Verifieert oude voorspellingen tegen waarnemingen, meet bias per model/variabele/lead-time, leert dynamische gewichten (70% geleerd + 30% standaard) |
| Live regenradar | RainViewer-tegels op Leaflet/OpenStreetMap |
| Luchtkwaliteit | AQI, PM2.5, PM10, ozon, NO₂ |
| Waarschuwingen | MeteoAlarm-feeds voor 28 landen |
| i18n | Nederlands, Engels, Duits; eenheden per land (°C/°F, km/u vs mph) |
| Publiek/Pro | Pro toont modelgewichten, CaptainMemory-inzichten en CAELIA-details |

## Zelf draaien

Geen build-stap nodig — statische bestanden:

```bash
# optie 1: elke statische webserver
python3 -m http.server 8080

# optie 2: direct openen
open index.html
```

Of host het op GitHub Pages: *Settings → Pages → deploy from branch*.

## Gebruikte API's (alle sleutelloos)

- Open-Meteo — forecast (4 modellen), uurdata, archief (30 jaar), luchtkwaliteit, geocoding
- MET Norway — onafhankelijke tweede bron (locationforecast 2.0)
- RainViewer — radartegels
- MeteoAlarm — waarschuwingen (via openbare CORS-proxy)
- BigDataCloud / geojs.io — reverse geocoding en IP-locatie

## Architectuur

```
index.html + css/ + js/
├── i18n.js     talen + eenheden per land
├── icons.js    SVG-weericonen (LiveSkyIcon-stijl)
├── api.js      alle externe bronnen
├── captain.js  AI Captain: ModelTrack → verificatie → bias → gewichten
├── caelia.js   klimaatprofiel + analoge dagen + regimes → dag 17–40
├── chart.js    canvas-grafieken (band, uurlijn)
├── radar.js    Leaflet + RainViewer
└── main.js     orchestratie en weergave
```

Leermetingen en voorkeuren staan in `localStorage` (`climora_modeltrack`, `climora_captainmemory`, `climora_selected_location`, …) en verlaten het toestel niet — zie [privacyverklaring](privacy.html).

## Licentie

Eigen beheer — alle code in deze repository is van de eigenaar.
