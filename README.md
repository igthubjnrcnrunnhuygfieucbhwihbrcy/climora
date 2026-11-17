# ClimoraWeather

**AI-gestuurde weerwebsite, volledig in eigen beheer.** Voorspelling tot 40 dagen vooruit: multi-model consensus (dag 1–16), CAELIA-regime-outlook (dag 17–40) en de AI Captain-leerlus. Geen accounts, geen API-sleutels, geen build-stap.

## Installeren

### Optie 1 — GitHub Pages (aanbevolen, gratis)

1. Zet de repository online via **[Settings → Pages](https://docs.github.com/nl/pages/getting-started-with-github-pages)** → *Deploy from a branch* → kies je branch en `/ (root)` → **Save**.
2. Na ~1 minuut staat de site op `https://<jouw-gebruikersnaam>.github.io/climora/`.
3. Klaar. Elke push naar die branch werkt de site automatisch bij.

### Optie 2 — Eigen server / Raspberry Pi

```bash
git clone https://github.com/igthubjnrcnrunnhuygfieucbhwihbrcy/climora.git
cd climora
python3 -m http.server 8080
```

Open daarna **http://localhost:8080**. Werkt met elke statische webserver:

- **[Nginx](https://nginx.org/en/docs/beginners_guide.html#static)** — zet de map als `root` in je `server`-blok
- **[Caddy](https://caddyserver.com/docs/)** — `climora.jouwdomein.nl { root * /pad/naar/climora; file_server }` (HTTPS automatisch)
- **[Docker](https://docs.docker.com/get-started/)** — `docker run -d -p 8080:80 -v "$PWD":/usr/share/nginx/html nginx`

### Optie 3 — Direct openen

Dubbelklik op `index.html` — de site werkt ook zonder server (alle API's draaien via HTTPS).

## Gebruik

- **Locatie kiezen:** typ in het zoekveld, of laat de browser je locatie bepalen (opgeslagen in je browser).
- **Taal:** NL / EN / DE via het keuzemenu rechtsboven.
- **Pro-modus:** knop rechtsboven — toont geleerde modelgewichten, bias-inzichten en CAELIA-details.
- **Leren:** de AI Captain slaat elke voorspelling op, verifieert die tegen waarnemingen en past de modelgewichten aan. Alles blijft lokaal in je browser ([privacyverklaring](privacy.html)).

## Hoe het werkt

```
Open-Meteo (4 modellen) + MET Norway ──► gewogen combinatie ──► dag 1–16 + band
        │                                                    │
        ▼                                                    ▼
  30-jaar archief ──► CAELIA (klimaat + analoge dagen + regimes) ──► dag 17–40
        │
        ▼
  AI Captain: voorspellingen verifiëren ──► bias meten ──► gewichten bijstellen
```

| Module | Functie |
|---|---|
| [js/api.js](js/api.js) | Alle bronnen: [Open-Meteo](https://open-meteo.com/), [MET Norway](https://api.met.no/), [RainViewer](https://www.rainviewer.com/), [MeteoAlarm](https://meteoalarm.org/) |
| [js/captain.js](js/captain.js) | AI Captain — leerlus in localStorage |
| [js/caelia.js](js/caelia.js) | CAELIA — dag 17–40 |
| [js/main.js](js/main.js) | Orchestratie en weergave |

## Problemen oplossen

- **Geen data?** Controleer of je internet werkt; de bronnen zijn gratis maar publiek.
- **Radar leeg?** De [Leaflet](https://leafletjs.com/)-bibliotheek komt van een CDN — bij offline gebruik eerst de bestanden lokaal plaatsen.
- **Leerlus resetten?** Wis in je browser de sitegegevens voor deze pagina.
