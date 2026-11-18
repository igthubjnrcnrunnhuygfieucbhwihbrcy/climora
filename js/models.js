/* ── Climora — AI-modellen en versies (inventaris) ────────────────────────
   Transparantiepaneel: alle modellen die ClimoraWeather gebruikt of kent,
   met eerlijke status. Statussen:
     active  = draait nu in deze site
     context = gebruikt als context/doorontwikkeling, nog niet actief
     off     = niet actief in deze statische versie
   IIFE-module, gelijk aan de andere Climora*-namespaces.                  */
(function () {
  "use strict";

  /* Status-labels via i18n-key (status_active / status_context / status_off) */
  const STATUS = { active: "status_active", context: "status_context", off: "status_off" };

  const PHYSICAL = [
    {
      name: "Open-Meteo multi-model", sub: "gewogen combinatie", status: "active",
      desc: {
        nl: "Combineert vier fysieke weermodellen dagelijks tot één ensemble (dag 1–16), gewichten worden bijgesteld op basis van geverifieerde voorspellingen.",
        en: "Daily weighted combination of four physical weather models into one ensemble (day 1–16); weights adapt from verified predictions.",
        de: "T\u00e4gliche gewichtete Kombination von vier physikalischen Modellen zu einem Ensemble (Tag 1\u201316); Gewichte lernen aus \u00fcberpr\u00fcften Vorhersagen.",
      },
    },
    {
      name: "ECMWF IFS", sub: "ecmwf_ifs025 · IFS Cy49r1 · 0,25° · gewicht 0,30", status: "active",
      desc: {
        nl: "Europees hoofdemodel (ECMWF) — het meest betrouwbaar op middellange termijn.",
        en: "European flagship model (ECMWF) — strongest in the medium range.",
        de: "Europ\u00e4isches Leitmodell (ECMWF) \u2014 st\u00e4rkste im mittleren Bereich.",
      },
    },
    {
      name: "DWD ICON", sub: "icon_seamless · ICON global/D2 · 0,25° · gewicht 0,25", status: "active",
      desc: {
        nl: "Duits weermodel (DWD) met uitstekende details rond fronten en neerslag.",
        en: "German model (DWD), excellent detail around fronts and precipitation.",
        de: "Deutsches Modell (DWD), starke Details bei Fronten und Niederschlag.",
      },
    },
    {
      name: "NOAA GFS", sub: "gfs_seamless · GFS 0.25 · 0,25° · gewicht 0,25", status: "active",
      desc: {
        nl: "Amerikaans globaal model — onafhankelijke blik (losse data-assimilatie).",
        en: "American global model — an independent view (separate data assimilation).",
        de: "Amerikanisches globales Modell \u2014 unabh\u00e4ngige Sicht (eigene Datenassimilation).",
      },
    },
    {
      name: "MET Norway", sub: "metno_seamless + eigen MET API · gewicht 0,20 (+0,20)", status: "active",
      desc: {
        nl: "Scandinavisch hogeresolutiemodel, twee keer aanwezig: via Open-Meteo én via de eigen MET Norway API.",
        en: "Scandinavian high-resolution model, present twice: via Open-Meteo and via the dedicated MET Norway API.",
        de: "Skandinavisches Hochaufl\u00f6sendes Modell, doppelt vorhanden: via Open-Meteo und via die eigene MET-Norway-API.",
      },
    },
    {
      name: "ECMWF SEAS5 / EC46", sub: "seasonal-api · SEAS5 + EC46 · 51 members", status: "context",
      desc: {
        nl: "Seizoensverwachting tot 7 maanden — bedoeld als context voor de regime-analyse; nog niet in de pijplijn.",
        en: "Seasonal outlook up to 7 months — intended as context for regime analysis; not yet in the pipeline.",
        de: "Saisonprognose bis 7 Monate \u2014 als Kontext f\u00fcr die Regimeanalyse gedacht; noch nicht in der Pipeline.",
      },
    },
  ];

  const LOCAL_AI = [
    {
      name: "CAELIA v9 — Neural Brain", sub: "MLP 12 → 32 → 24 → 2 · backpropagation · mini-batch SGD · seed 2024 · 25 epochs (10 warm)", status: "active",
      desc: {
        nl: "Echt getraind neuraal netwerk dat op ~4 jaar meetdata het klimaat leert. Kerntemperatuurmodel voor dag 17–40, met 3 denk-passes per dag; gewichten blijven per locatie bewaard (warm start).",
        en: "A genuinely trained neural network learning the climate from ~4 years of observations. Core temperature model for day 17–40, with 3 thinking passes per day; weights persist per location (warm start).",
        de: "Echt trainiertes neuronales Netz, das das Klima aus ~4 Jahren Beobachtungen lernt. Kerntemperaturmodell f\u00fcr Tag 17\u201340, mit 3 Denkpa\u00dfgaben pro Tag; Gewichte bleiben pro Ort erhalten (Warm-Start).",
      },
    },
    {
      name: "CAELIA Kennislaag", sub: "v9.1 — fysische rekenbibliotheek", status: "active",
      desc: {
        nl: "Thermodynamica, stralingsbalans, wolken en fronten. Rekent per dag na of de voorspelling fysisch klopt (denk-pass 4) en corrigeert met getallen van © KNMI/Wikipedia-bronnen.",
        en: "Thermodynamics, radiation balance, clouds and fronts. Re-checks each forecast day physically (pass 4) and corrects with numbers; sources: KNMI/Wikipedia.",
        de: "Thermodynamik, Strahlungsbilanz, Wolken und Fronten. Pr\u00fcft jeden Tag physikalisch nach (Pass 4) und korrigiert mit Zahlen; Quellen: KNMI/Wikipedia.",
      },
    },
    {
      name: "CAELIA Local Engine", sub: "v2.0 — compacte fallback van v8", status: "active",
      desc: {
        nl: "Klimaatprofiel (366 buckets), analoge dagen en regime-analyse (Fourier-achtige seizoensvorm met ±4-dagen vensters). Werkt volledig offline als noodmodel — actief als de modellen uitvallen.",
        en: "Climate profile (366 buckets), analogue days and regime analysis (Fourier-like seasonal form with ±4-day windows). Fully offline emergency model — active when sources fail.",
        de: "Klimaprofil (366 Buckets), analoge Tage und Regimeanalyse (Fourier-artige Jahresform mit \u00b14-Tage-Fenstern). Voll offline als Notmodell \u2014 aktiv, wenn Quellen ausfallen.",
      },
    },
    {
      name: "Local SLM", sub: "v1 — browser-native taalmodel", status: "off",
      desc: {
        nl: "Regelgebaseerde kennisbank + NLG-templates + kwaliteitsscores voor de dagsamenvatting. In deze statische versie schrijft Climora de analyses met vaste templates; de SLM-laag is voorbereid maar niet actief.",
        en: "Rule-based knowledge base + NLG templates + quality scores for daily summaries. In this static version Climora writes summaries with fixed templates; the SLM layer is prepared but not active.",
        de: "Regelbasierte Wissensbank + NLG-Templates + Qualit\u00e4tsscores f\u00fcr Tageszusammenfassungen. In dieser statischen Version schreibt Climora mit festen Templates; die SLM-Schicht ist vorbereitet, aber inaktiv.",
      },
    },
    {
      name: "Device AI", sub: "v1 — toestelvalidatie · klimaatnet 3→24→24→2 · foutnet n→12→1", status: "off",
      desc: {
        nl: "Valideert de voorspelling lokaal en leert systematische modelfouten uit geverifieerde data. In deze versie doet de AI Captain die controle grofweg; het fulldevice-netwerk is nog niet geactiveerd.",
        en: "Validates forecasts on-device and learns systematic model errors from verified data. In this version the AI Captain handles that check; the full device network is not yet enabled.",
        de: "Validiert Prognosen lokal und lernt systematische Modellfehler aus \u00fcberpr\u00fcften Daten. In dieser Version \u00fcbernimmt der AI Captain diese Pr\u00fcfung; das vollst\u00e4ndige Device-Netz ist noch nicht aktiv.",
      },
    },
  ];

  const LEARNING = [
    {
      name: "Model Learning Engine", sub: "v1 — bias + MAE per lead-time-bucket", status: "active",
      desc: {
        nl: "Verifieert eerdere voorspellingen (dag 3–7, 8–14, 15+) tegen geverifieerde data en levert geleerde modelgewichten: 70% geleerd / 30% standaard.",
        en: "Verifies earlier predictions (day 3–7, 8–14, 15+) against actuals and delivers learned model weights: 70% learned / 30% default.",
        de: "\u00dcberpr\u00fcft fr\u00fchere Prognosen (Tag 3\u20137, 8\u201314, 15+) gegen reale Daten und liefert gelernte Modellgewichte: 70% gelernt / 30% Standard.",
      },
    },
    {
      name: "Gradient Boosting", sub: "14 stumps · lr 0,35", status: "off",
      desc: {
        nl: "Corrigeert residuen op de temperatuuranomalie. Voorbereid voor de CAELIA-nazorg; niet actief in deze statische versie.",
        en: "Corrects residuals on the temperature anomaly. Prepared as a CAELIA second pass; not active in this static version.",
        de: "Korrigiert Residuen der Temperaturanomalie. Als CAELIA-Zweitrunde vorbereitet; in dieser statischen Version inaktiv.",
      },
    },
    {
      name: "Elman-RNN", sub: "8 verborgen · 5 invoer · lr 0,02 · 3 epochs", status: "off",
      desc: {
        nl: "Leest de reeks dagelijkse anomalieën als sequentie en rolt die door over de horizon. Volgt na de brein-integratie.",
        en: "Reads the daily anomaly sequence and rolls it across the horizon. Planned after the brain integration.",
        de: "Liest t\u00e4gliche Anomalie-Sequenzen und rollt sie \u00fcber den Horizont. Nach der Gehirn-Integration geplant.",
      },
    },
    {
      name: "Reinforcement Learning", sub: "epsilon-greedy bandit · α 0,15 · ε 0,05", status: "off",
      desc: {
        nl: "Leert per weermodel hoe sterk het gewicht bijgesteld moet worden (Q-waarden). Nog niet actief; de Captain leert nu met statische bias.",
        en: "Learns per model how strongly to adjust its weight (Q-values). Not yet active; the Captain currently learns with static bias.",
        de: "Lern pro Modell, wie stark das Gewicht angepasst wird (Q-Werte). Noch nicht aktiv; der Captain lernt derzeit mit statischer Bias.",
      },
    },
  ];

  const LLM = {
    name: "Taalmodellen — OpenRouter", sub: "fallback-keten · gratis tier · 50 verzoeken/dag · 20/min", status: "off",
    chains: [
      {
        label: "Standaardketen (zwaar redeneer)",
        models: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free → google/gemma-4-31b-it:free → nvidia/nemotron-3-super-120b-a12b:free → google/gemma-4-26b-a4b-it:free → thinkingmachines/inkling:free → inclusionai/ling-3.0-flash-sante:free → nvidia/nemotron-3-ultra-550b-a55b:free",
      },
      {
        label: "Lichte keten (kort, lage latency)",
        models: "google/gemma-4-26b-a4b-it:free → inclusionai/ling-3.0-flash-sante:free → nvidia/nemotron-3.5-lightning:free → google/gemma-4-31b-it:free",
      },
    ],
    desc: {
      nl: "Niet actief: dit is een statische website zonder server, en een OpenRouter-key mag nooit in frontendcode staan (iedereen kon die lezen). De denktraces komen nu uit CAELIA zelf.",
      en: "Not active: this is a static site without a server, and an OpenRouter key must never live in frontend code (anyone could read it). The reasoning traces now come from CAELIA itself.",
      de: "Inaktiv: Dies ist eine statische Website ohne Server, und ein OpenRouter-Key d\u00fcrfte nie in Frontend-Code stehen (jeder k\u00f6nnte ihn lesen). Die Denkspuren stammen jetzt direkt von CAELIA.",
    },
  };

  const INDICES = [
    { name: "NAO", sub: "NOAA CPC", desc: { nl: "Noord-Atlantische oscillatie — bepaalt westcirculatie en neerslagregime.", en: "North Atlantic Oscillation — drives westerly flow and the precipitation regime.", de: "Nordatlantische Oszillation \u2014 bestimmt Westzirkulation und Niederschlagsregime." } },
    { name: "AO", sub: "NOAA CPC", desc: { nl: "Arctische oscillatie — koude-invallen en blokkades.", en: "Arctic Oscillation — cold outbreaks and blocking.", de: "Arktische Oszillation \u2014 K\u00e4lteeinbr\u00fcche und Blockierungen." } },
    { name: "PNA", sub: "NOAA CPC", desc: { nl: "Pacifisch-Noord-Amerikaans patroon — golfpatroon op gematigde breedte.", en: "Pacific–North American pattern — mid-latitude wave pattern.", de: "Pazifik-Nordamerika-Muster \u2014 Wellenmuster der gem\u00e4\u00dfigen Breiten." } },
    { name: "ONI / ENSO", sub: "NOAA PSL", desc: { nl: "El Niño/La Niña — seizoensinvloed op het Europese weerbeeld.", en: "El Niño/La Niña — seasonal influence on the European weather picture.", de: "El Ni\u00f1o/La Ni\u00f1a \u2014 jahreszeitlicher Einfluss auf das europ\u00e4ische Wetterbild." } },
  ].map(x => ({ ...x, status: "context" }));

  function badge(status, t) {
    return `<span class="st-badge st-${status}">${escape(t(STATUS[status]))}</span>`;
  }
  function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function render(t) {
    const dl = (x) => `<div class="model-row">
        <div class="m-head"><span class="m-name">${escape(x.name)}</span>${badge(x.status, t)}</div>
        <div class="m-sub">${escape(x.sub)}</div>
        <div class="m-desc">${escape(x.desc[t.lang] || x.desc.nl)}</div>
      </div>`;

    let html = `<h3 class="small muted" style="margin:14px 0 4px">${escape(t("sect_weather"))}</h3>` + PHYSICAL.map(dl).join("");
    html += `<h3 class="small muted" style="margin:14px 0 4px">${escape(t("sect_ai"))}</h3>` + LOCAL_AI.map(dl).join("");
    html += `<h3 class="small muted" style="margin:14px 0 4px">${escape(t("sect_learn"))}</h3>` + LEARNING.map(dl).join("");
    html += `<h3 class="small muted" style="margin:14px 0 4px">${escape(t("sect_llm"))}</h3>
      <div class="model-row">
        <div class="m-head"><span class="m-name">${escape(LLM.name)}</span>${badge(LLM.status, t)}</div>
        <div class="m-sub">${escape(LLM.sub)}</div>
        <div class="m-desc">${escape(LLM.desc[t.lang] || LLM.desc.nl)}</div>
        ${LLM.chains.map(c => `<div class="m-chain"><strong>${escape(c.label)}:</strong> ${escape(c.models)}</div>`).join("")}
      </div>`;
    html += `<h3 class="small muted" style="margin:14px 0 4px">${escape(t("sect_indices"))}</h3>` + INDICES.map(dl).join("");
    html += `<p class="muted small" style="margin-top:12px">${escape(t("models_note"))}</p>`;
    return html;
  }

  window.ClimoraModels = { render, PHYSICAL, LOCAL_AI, LEARNING, LLM, INDICES };
})();
