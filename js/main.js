/* ClimoraWeather — orchestratie: pagina's, data, AI-lagen en weergave.
 * Opstartvolgorde: opgeslagen locatie → GPS → IP-fallback; AI Captain-leerpipeline;
 * multi-model data; CAELIA voor dag 17–40; weergave per pagina. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const I18N = () => window.ClimoraI18N;
  const API = () => window.ClimoraAPI;
  const Captain = () => window.ClimoraCaptain;
  const Caelia = () => window.ClimoraCaelia;

  const state = {
    page: "home",
    location: null,
    daily: [],
    extended: [],
    min15: [],
    hourly: [],
    air: null,
    warnings: [],
    units: null,
    caeliaInfo: null,
    showLongRange: false,
  };

  /* ── Helpers ───────────────────────────────────────── */
  function fmtDate(dateStr, opts) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString(I18N().locale(), opts || { weekday: "short", day: "numeric", month: "short" });
  }
  function dayName(dateStr, idx) {
    if (idx === 0) return I18N().t("today");
    if (idx === 1) return I18N().t("tomorrow");
    return fmtDate(dateStr, { weekday: "short", day: "numeric", month: "short" });
  }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function themeIsDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function pct(arr, p) {
    const v = arr.filter(x => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    const idx = (v.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return v[lo] + (v[hi] - v[lo]) * (idx - lo);
  }
  function wmean(pairs) {
    const tw = pairs.reduce((s, p) => s + p[1], 0);
    return tw ? pairs.reduce((s, p) => s + p[0] * p[1], 0) / tw : null;
  }
  function beaufort(ms) {
    if (ms == null) return null;
    return Math.max(0, Math.min(12, Math.round(Math.pow(ms / 0.836, 2 / 3))));
  }
  function uvInfo(uv) {
    if (uv == null) return null;
    if (uv < 3) return { label: I18N().t("uv_low"), cls: "good", advice: I18N().t("uv_advice_low") };
    if (uv < 6) return { label: I18N().t("uv_moderate"), cls: "", advice: I18N().t("uv_advice_mid") };
    if (uv < 8) return { label: I18N().t("uv_high"), cls: "warn", advice: I18N().t("uv_advice_high") };
    if (uv < 11) return { label: I18N().t("uv_vhigh"), cls: "bad", advice: I18N().t("uv_advice_high") };
    return { label: I18N().t("uv_extreme"), cls: "bad", advice: I18N().t("uv_advice_high") };
  }
  function aqiInfo(aqi) {
    if (aqi == null) return null;
    if (aqi <= 20) return { label: I18N().t("aqiGood"), cls: "good" };
    if (aqi <= 40) return { label: I18N().t("aqiFair"), cls: "good" };
    if (aqi <= 60) return { label: I18N().t("aqiModerate"), cls: "" };
    if (aqi <= 80) return { label: I18N().t("aqiPoor"), cls: "warn" };
    if (aqi <= 100) return { label: I18N().t("aqiVeryPoor"), cls: "bad" };
    return { label: I18N().t("aqiExtremelyPoor"), cls: "bad" };
  }
  function outdoorScore(day) {
    if (!day) return null;
    let score = 10;
    if (day.tmax != null) {
      if (day.tmax > 30) score -= (day.tmax - 30) * 0.5;
      if (day.tmax < 5) score -= (5 - day.tmax) * 0.4;
    }
    if (day.wind != null) score -= Math.max(0, day.wind * 3.6 - 25) * 0.06;
    if (day.precip != null) score -= Math.min(4, day.precip * 0.7);
    if (day.precipProb != null) score -= (day.precipProb / 100) * 2;
    return Math.max(0, Math.min(10, score));
  }

  /* ── Locatie ───────────────────────────────────────── */
  function saveLocation(loc) {
    state.location = loc;
    try { localStorage.setItem("climora_selected_location", JSON.stringify(loc)); } catch { /* quota */ }
  }

  async function resolveLocation() {
    try {
      const saved = JSON.parse(localStorage.getItem("climora_selected_location"));
      if (saved && saved.name && saved.lat != null) return saved;
    } catch { /* corrupte opslag */ }
    try {
      const gps = await API().gpsLocate();
      const rev = await API().reverseGeocode(gps.lat, gps.lon);
      return Object.assign(gps, rev);
    } catch {
      return await API().ipLocate();
    }
  }

  /* ── Laden + combineren ────────────────────────────── */
  function setLoadingStep(key) { $("loading-text").textContent = I18N().t(key); }

  async function loadWeather() {
    const loc = state.location;
    if (!loc) return;
    state.units = I18N().unitsForCountry(loc.countryCode);
    show("error-banner", false);

    const locKey = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;

    setLoadingStep("load_captain");
    try { await Captain().verifyAndLearn(locKey, loc.lat, loc.lon); } catch { /* leren mag nooit breken */ }
    const { weights, learned } = Captain().computeWeights();

    setLoadingStep("load_sources");
    const [modelsRes, metNoRes, min15Res, hourlyRes, airRes, warningsRes] = await Promise.allSettled([
      Promise.all(API().OM_MODELS.map(m => API().fetchOmModel(loc.lat, loc.lon, m.id))),
      API().fetchMetNo(loc.lat, loc.lon),
      API().fetchMinutely15(loc.lat, loc.lon),
      API().fetchHourly(loc.lat, loc.lon),
      API().fetchAirQuality(loc.lat, loc.lon),
      API().fetchWarnings(loc.countryCode),
    ]);

    const models = [];
    if (modelsRes.status === "fulfilled") {
      for (const r of modelsRes.value) {
        if (!r) continue;
        const meta = API().OM_MODELS.find(m => m.id === r.modelId);
        models.push({ modelId: r.modelId, name: meta ? meta.name : r.modelId, daily: r.daily });
      }
    }
    if (metNoRes.status === "fulfilled" && metNoRes.value) models.push(metNoRes.value);

    if (!models.length) {
      $("error-banner").textContent = I18N().t("error_prefix") + ": " + I18N().t("no_connection");
      show("error-banner", true);
      return;
    }

    setLoadingStep("load_models");
    const baseModel = models.find(m => m.daily && m.daily.time && m.daily.sunrise && m.daily.sunrise.length) || models[0];
    const base = baseModel.daily;
    const nDays = Math.min(16, base.time.length);
    const daily = [];
    for (let i = 0; i < nDays; i++) {
      const date = base.time[i];
      const lead = i + 1;
      const perVar = { tmax: [], tmin: [], precip: [], tmaxAll: [], pressure: [] };
      for (const m of models) {
        const d = m.daily;
        if (!d || !d.time || d.time[i] !== date) continue;
        const w = weights[m.modelId] || 0.05;
        if (d.temperature_2m_max[i] != null) {
          perVar.tmax.push([d.temperature_2m_max[i] - Captain().getBias(m.modelId, lead, "tmax"), w]);
          perVar.tmaxAll.push(d.temperature_2m_max[i]);
        }
        if (d.temperature_2m_min[i] != null) perVar.tmin.push([d.temperature_2m_min[i] - Captain().getBias(m.modelId, lead, "tmin"), w]);
        if (d.precipitation_sum[i] != null) perVar.precip.push([Math.max(0, d.precipitation_sum[i] - Captain().getBias(m.modelId, lead, "precip")), w]);
        const pressureArr = d.pressure_msl_mean || d.pressure_msl;
        if (pressureArr && pressureArr[i] != null) perVar.pressure.push(pressureArr[i]);
      }
      const tmax = wmean(perVar.tmax);
      const spreadLo = pct(perVar.tmaxAll, 0.1);
      const spreadHi = pct(perVar.tmaxAll, 0.9);
      daily.push({
        date,
        tmax, tmin: wmean(perVar.tmin),
        tmaxP10: tmax != null && spreadLo != null ? Math.round(Math.min(tmax, spreadLo) * 10) / 10 : null,
        tmaxP90: tmax != null && spreadHi != null ? Math.round(Math.max(tmax, spreadHi) * 10) / 10 : null,
        precip: wmean(perVar.precip),
        precipProb: pct(models.map(m => m.daily && m.daily.precipitation_probability_max ? m.daily.precipitation_probability_max[i] : null), 0.5),
        wind: wmean(models.map(m => m.daily && m.daily.wind_speed_10m_max ? [m.daily.wind_speed_10m_max[i], weights[m.modelId] || 0.05] : null).filter(Boolean)),
        windDir: pct(models.map(m => m.daily && m.daily.wind_direction_10m_dominant ? m.daily.wind_direction_10m_dominant[i] : null), 0.5),
        code: (() => { const c = pct(models.map(m => m.daily && m.daily.weather_code ? m.daily.weather_code[i] : null), 0.5); return c == null ? 3 : Math.round(c); })(),
        pressure: wmean(perVar.pressure.map(p => [p, 1])),
        sunrise: base.sunrise ? base.sunrise[i] : null,
        sunset: base.sunset ? base.sunset[i] : null,
        source: "models",
      });
    }
    state.daily = daily;

    setLoadingStep("load_longterm");
    try {
      const archive = await API().fetchArchive(loc.lat, loc.lon);
      const profile = Caelia().buildClimateProfile(archive);
      const ext = Caelia().extendTo40(daily, profile, archive, Captain().hasLearning());
      state.extended = ext.days;
      state.caeliaInfo = { analogYears: ext.analogYears, regimes: ext.regimes, hasProfile: !!profile };
    } catch {
      state.extended = [];
      state.caeliaInfo = null;
    }

    try { Captain().recordPredictions(locKey, models); } catch { /* negeer */ }

    state.min15 = min15Res.status === "fulfilled" ? min15Res.value : [];
    state.hourly = hourlyRes.status === "fulfilled" ? hourlyRes.value : [];
    state.air = airRes.status === "fulfilled" ? airRes.value : null;
    state.warnings = warningsRes.status === "fulfilled" ? warningsRes.value : [];

    renderAll(learned);
  }

  /* ── Render: alles ─────────────────────────────────── */
  function renderAll(learned) {
    const loc = state.location;
    $("location-name").textContent = loc.name + (loc.countryCode ? " " + loc.countryCode.toUpperCase() : "");
    document.title = `ClimoraWeather — ${loc.name}`;

    renderWarnings();
    renderHome();
    renderDays40();
    renderMaker(learned);
    renderStaticTexts();
    show("app-root", true);
    show("loading", false);
  }

  function renderWarnings() {
    const el = $("warnings-banner");
    const w = state.warnings;
    if (!w || !w.length) { show("warnings-banner", false); return; }
    const worst = w.some(x => x.level === "rood") ? "code-rood" : w.some(x => x.level === "oranje") ? "code-oranje" : "";
    el.classList.toggle("code-rood", worst === "code-rood");
    el.classList.toggle("code-oranje", worst === "code-oranje");
    const label = lvl => lvl === "rood" ? I18N().t("warn_red") : lvl === "oranje" ? I18N().t("warn_orange") : I18N().t("warn_yellow");
    el.innerHTML = w.slice(0, 3).map(x =>
      `<div class="warn-item"><span class="warn-level">${escapeHtml(label(x.level))}</span><strong>${escapeHtml(x.title)}</strong>` +
      (x.area ? ` — ${escapeHtml(x.area)}` : "") + `</div>`
    ).join("") + (w.length > 3 ? `<div class="warn-item muted small">${escapeHtml(I18N().t("more_warnings", { n: w.length - 3 }))}</div>` : "");
    show("warnings-banner", true);
  }

  /* ── Pagina: Home ──────────────────────────────────── */
  function renderHome() {
    const u = state.units;
    const loc = state.location;
    const d0 = state.daily[0];
    if (!d0) return;

    /* Huidige temp: voorkeur 15-min-nowcast, anders uurdata */
    const current = state.min15[0] || state.hourly[0] || null;

    /* Hero-oordeel */
    const score = outdoorScore(d0);
    const verdictKey = score >= 7 ? "hero_good" : score >= 4 ? "hero_moderate" : "hero_bad";
    const verdict = $("hero-verdict");
    verdict.textContent = I18N().t(verdictKey, { loc: loc.name });
    verdict.className = "hero-verdict" + (score < 7 ? (score >= 4 ? " moderate" : " bad") : "");

    const heroCode = current ? current.code : d0.code;
    const dayNow = isDayNow(d0);
    $("hero-temp").textContent = current && current.temp != null ? `${u.temp(current.temp)}${u.tempUnit}` : `${u.temp(d0.tmax)}${u.tempUnit}`;
    const feelsNow = current && current.feelsLike != null ? current.feelsLike : d0.tmax != null && d0.tmin != null ? (d0.tmax + d0.tmin) / 2 : null;
    $("hero-feels").textContent = feelsNow != null ? I18N().t("feels_temp", { v: `${u.temp(feelsNow)}${u.tempUnit}` }) : "";
    $("hero-desc").textContent = I18N().weatherLabel(heroCode);

    /* Weericoon + dynamische hemel-achtergrond */
    $("hero-icon").innerHTML = window.ClimoraIcons.svg(heroCode, dayNow);
    $("hero-card").className = "hero-card " + skyClass(heroCode, dayNow);

    /* Snelle chips: max/min, vochtigheid, wind */
    const chips = [];
    if (d0.tmax != null) chips.push(`⬆ ${u.temp(d0.tmax)}${u.tempUnit}`);
    if (d0.tmin != null) chips.push(`⬇ ${u.temp(d0.tmin)}${u.tempUnit}`);
    if (current && current.humidity != null) chips.push(`💧 ${Math.round(current.humidity)}%`);
    if (current && current.wind != null) chips.push(`💨 ${u.wind(current.wind)} ${u.windUnit}`);
    $("hero-chips").innerHTML = chips.map(c => `<span class="chip">${escapeHtml(c)}</span>`).join("");

    /* Droog-tot-berekening uit 15-min-nowcast */
    const dryInfo = computeDryUntil();
    const details = [];
    if (d0.tmax != null) details.push(`<li><strong>${escapeHtml(I18N().t("max_today", { v: `${u.temp(d0.tmax)}${u.tempUnit}` }))}</strong></li>`);
    if (d0.tmin != null) details.push(`<li><strong>${escapeHtml(I18N().t("min_tonight", { v: `${u.temp(d0.tmin)}${u.tempUnit}` }))}</strong></li>`);
    if (d0.pressure != null) details.push(`<li>${escapeHtml(I18N().t("pressure_label", { v: Math.round(d0.pressure) }))}</li>`);
    if (dryInfo) details.push(`<li>${escapeHtml(dryInfo)}</li>`);
    $("hero-details").innerHTML = details.join("");

    /* Mini-radar + samenvatting */
    $("radar-mini-title").textContent = I18N().t("radar_title", { loc: loc.name });
    const next3 = state.min15.slice(0, 12);
    const rainingNow = next3.length && (next3[0].precip || 0) > 0.05;
    $("radar-summary").textContent = rainingNow
      ? I18N().t("rain_header", { hours: 2 }).replace(/^Regen nu en straks.*$/, I18N().t("rain_continues", { int: I18N().t("rain_normal"), hours: 2 }))
      : I18N().t("no_rain_active");
    const nextRain = next3.findIndex((s, i) => i > 0 && (s.precip || 0) > 0.05);
    $("radar-next").textContent = nextRain === -1 && !rainingNow
      ? I18N().t("next_rain", { pct: d0.precipProb != null ? Math.round(d0.precipProb) : 0, h: 3 })
      : nextRain > 0 ? I18N().t("rain_later", { time: next3[nextRain].timeLabel, int: I18N().t("rain_normal") }).replace(/^Rond/, I18N().t("next_rain", { pct: "", h: 3 }).split(":")[0] + ":") : "";

    /* Mini-radar in de hero-kaart */
    window.ClimoraRadar.init(loc.lat, loc.lon, "radar-mini", 8);

    /* Snel overzicht */
    renderOverview(d0, current);

    /* 24 uur + zon + weekstrip */
    renderHours24();
    renderSun(d0);
    renderWeek();
  }

  function isDayNow(d0) {
    const parse = iso => iso ? parseInt(iso.slice(11, 13), 10) * 60 + parseInt(iso.slice(14, 16), 10) : null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rise = parse(d0.sunrise), set = parse(d0.sunset);
    if (rise == null || set == null) return nowMin >= 7 * 60 && nowMin < 20 * 60;
    return nowMin >= rise && nowMin < set;
  }

  function skyClass(code, day) {
    if (!day) return "sky-night";
    if (code === 0 || code === 1) return "sky-clear";
    if (code <= 48) return "sky-cloudy";
    if (code <= 67 || (code >= 80 && code < 95)) return "sky-rain";
    if (code >= 95) return "sky-storm";
    return "sky-cloudy";
  }

  function computeDryUntil() {
    const slots = state.min15.length ? state.min15 : state.hourly;
    if (!slots.length) return null;
    for (const s of slots) {
      if ((s.precip || 0) > 0.1) return I18N().t("rain_from", { time: s.timeLabel });
    }
    const last = slots[Math.min(slots.length - 1, 11)];
    return I18N().t("dry_until", { time: last.timeLabel });
  }

  function renderOverview(d0, current) {
    const u = state.units;
    const aq = state.air;
    const cards = [];

    /* 1. Neerslagkans */
    const prob = current && current.precipProb != null ? current.precipProb : d0.precipProb;
    const mm = d0.precip != null ? u.precip(d0.precip) : "0.0";
    cards.push({
      icon: "💧", label: I18N().t("ov_precip"),
      value: `${prob != null ? Math.round(prob) : 0}%`,
      cls: prob > 60 ? "bad" : prob > 30 ? "warn" : "good",
      subs: [computeDryUntil() || "", I18N().t("ov_precip_mm", { mm })],
    });

    /* 2. Wind & Windkracht */
    const windMs = current && current.wind != null ? current.wind : d0.wind;
    const bft = beaufort(windMs);
    const dirIdx = d0.windDir != null ? Math.round(d0.windDir / 45) % 8 : null;
    const compass = I18N().COMPASS[I18N().lang] || I18N().COMPASS.nl;
    const gust = current && current.gusts != null ? current.gusts : null;
    cards.push({
      icon: "🌬️", label: I18N().t("ov_wind"),
      value: bft != null ? `${bft} Bft` : "—",
      cls: bft >= 8 ? "bad" : bft >= 6 ? "warn" : "",
      subs: [
        bft != null ? I18N().t(`bft_${bft}`) : "",
        `${u.wind(windMs || 0)} ${u.windUnit}${dirIdx != null ? " " + compass[dirIdx] : ""}`,
        gust != null ? I18N().t("gusts", { v: `${u.wind(gust)} ${u.windUnit}` }) : "",
      ].filter(Boolean),
    });

    /* 3. UV-index */
    const uv = uvInfo(aq && aq.uv_index);
    cards.push({
      icon: "🕶️", label: I18N().t("ov_uv"),
      value: uv ? I18N().t("uv_index_label", { v: Math.round(aq.uv_index) }) : "—",
      cls: uv ? uv.cls : "",
      subs: uv ? [uv.label, uv.advice] : [],
    });

    /* 4. Luchtkwaliteit */
    const aqi = aq && aq.european_aqi != null ? aqiInfo(aq.european_aqi) : null;
    const pollen = aq ? Math.max(aq.alder_pollen || 0, aq.birch_pollen || 0, aq.grass_pollen || 0) : null;
    cards.push({
      icon: "🌿", label: I18N().t("ov_air"),
      value: aq && aq.european_aqi != null ? I18N().t("aqi_label", { v: Math.round(aq.european_aqi) }) : "—",
      cls: aqi ? aqi.cls : "",
      subs: [aqi ? aqi.label : "", pollen != null ? (pollen > 20 ? I18N().t("pollen_high") : I18N().t("pollen_low")) : ""].filter(Boolean),
    });

    $("overview-grid").innerHTML = cards.map(c => `
      <div class="card ov-card">
        <div class="ov-label"><span class="ov-icon">${c.icon}</span>${escapeHtml(c.label)}</div>
        <div class="ov-value ${c.cls}">${escapeHtml(c.value)}</div>
        ${c.subs.map(s => `<div class="ov-sub">${escapeHtml(s)}</div>`).join("")}
      </div>`).join("");
  }

  function renderHours24() {
    const u = state.units;
    const loc = state.location;
    const slots = (state.min15.length >= 12 ? state.min15.filter((_, i) => i % 2 === 0) : state.hourly).slice(0, 26);
    if (slots.length < 2) return;

    $("h-hours").textContent = I18N().t("hours_title", { loc: loc.name });
    $("hours-sub").textContent = I18N().t("hours_sub");

    /* Uurblokken: Nu + temp + neerslagkans */
    $("hour-strip").innerHTML = slots.map((s, i) => `
      <div class="hour-cell${i === 0 ? " now" : ""}">
        <div class="h-time">${i === 0 ? escapeHtml(I18N().t("now_label")) : escapeHtml(s.timeLabel)}</div>
        <div class="h-icon">${window.ClimoraIcons.svg(s.code != null ? s.code : 3, true)}</div>
        <div class="h-temp">${s.temp != null ? u.temp(s.temp) + u.tempUnit : "—"}</div>
        <div class="h-precip">${s.precipProb != null ? Math.round(s.precipProb) + "%" : ""}</div>
      </div>`).join("");

    /* Grafiek: blauwe lijn + neerslagstaven, piek-onderschrift */
    const points = slots.map(s => ({ tmax: s.temp, tmin: null, p10: null, p90: null, precip: s.precip, label: s.timeLabel }));
    window.ClimoraChart.drawTempChart($("hourly-chart"), points, { light: !themeIsDark() });

    let peakI = 0;
    points.forEach((p, i) => { if (p.tmax != null && (points[peakI].tmax == null || p.tmax > points[peakI].tmax)) peakI = i; });
    const peak = points[peakI];
    $("chart-caption").textContent = peak.tmax != null
      ? I18N().t("chart_caption", { loc: loc.name, peak: u.temp(peak.tmax), time: peak.label })
      : "";
    $("chart-local").textContent = I18N().t("chart_local", { loc: loc.name });
  }

  /* ── Zon-boog ───────────────────────────────── */
  function renderSun(d0) {
    const parse = iso => iso ? parseInt(iso.slice(11, 13), 10) * 60 + parseInt(iso.slice(14, 16), 10) : null;
    const rise = parse(d0.sunrise), set = parse(d0.sunset);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const fmt = min => min != null ? `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}` : "—";
    $("h-sun").textContent = I18N().t("sun_title");
    $("sun-rise-label").textContent = I18N().t("sun_rise");
    $("sun-set-label").textContent = I18N().t("sun_set");
    $("sun-length-label").textContent = I18N().t("sun_length");
    $("sun-rise").textContent = fmt(rise);
    $("sun-set").textContent = fmt(set);
    $("sun-length").textContent = rise != null && set != null && set > rise
      ? I18N().t("hours_short", { n: Math.floor((set - rise) / 60), m: (set - rise) % 60 }) : "—";
    window.ClimoraChart.drawSunArc($("sun-canvas"), rise, set, nowMin, { light: !themeIsDark() });
  }

  /* ── 7-daagse strip ─────────────────────────── */
  function renderWeek() {
    const u = state.units;
    const week = state.daily.slice(0, 7);
    if (!week.length) return;
    $("h-week").textContent = I18N().t("week_title");
    $("week-strip").innerHTML = week.map((d, i) => `
      <div class="week-cell${i === 0 ? " today" : ""}" data-idx="${i}">
        <div class="w-day">${escapeHtml(dayName(d.date, i))}</div>
        <div class="w-icon">${window.ClimoraIcons.svg(d.code, true)}</div>
        <div class="w-precip">${d.precipProb != null && d.precipProb > 0 ? Math.round(d.precipProb) + "%" : ""}</div>
        <div class="w-temp"><strong>${d.tmax != null ? u.temp(d.tmax) : "—"}°</strong><span>${d.tmin != null ? u.temp(d.tmin) : "—"}°</span></div>
      </div>`).join("");
  }

  /* ── Nowcast-strip op de radarpagina ───────── */
  function renderNowcast() {
    const u = state.units;
    const slots = (state.min15.length ? state.min15 : []).slice(0, 32);
    if (!slots.length) return;
    $("nowcast-title").textContent = I18N().t("nowcast_title");
    $("nowcast-sub").textContent = I18N().t("nowcast_sub");
    $("nowcast-strip").innerHTML = slots.map((s, i) => {
      const mm = s.precip || 0;
      const drizzle = mm > 0 && mm <= 0.4;
      const lvl = mm <= 0.4 ? "nc-1" : mm <= 1.5 ? "nc-2" : mm <= 4 ? "nc-3" : "nc-4";
      return `<div class="nc-cell${i === 0 ? " now" : ""}${mm > 0 ? "" : " dry"}">
        <div class="h-time">${i === 0 ? escapeHtml(I18N().t("now_label")) : escapeHtml(s.timeLabel)}</div>
        <div class="nc-bar ${lvl}"></div>
        <div class="nc-mm">${mm > 0 ? u.precip(mm) + " mm" : "—"}</div>
        <div class="nc-kind">${mm > 0 ? escapeHtml(drizzle ? I18N().t("drizzle_label") : I18N().t("rain_light")) : ""}</div>
      </div>`;
    }).join("");
  }

  /* ── Pagina: 40 dagen ──────────────────────────────── */
  function renderDays40() {
    const u = state.units;
    const all = state.daily.concat(state.extended);
    if (!all.length) return;

    $("h-daylist").textContent = I18N().t("nav_40");
    const gMin = Math.min(...all.map(d => d.tmin).filter(v => v != null));
    const gMax = Math.max(...all.map(d => (d.tmaxP90 != null ? d.tmaxP90 : d.tmax)).filter(v => v != null));
    const span = Math.max(1, gMax - gMin);

    const rowHtml = (d, i) => {
      const lo = d.tmin != null ? ((d.tmin - gMin) / span) * 100 : 0;
      const hi = d.tmax != null ? ((d.tmax - gMin) / span) * 100 : 0;
      return `<div class="day-row" data-date="${d.date}">
        <div class="d-name">${escapeHtml(dayName(d.date, i))}${d.source === "caelia" ? `<span class="d-ai">AI</span>` : ""}</div>
        <div class="d-icon">${window.ClimoraIcons.svg(d.code, true)}</div>
        <div>
          <div class="d-label">${escapeHtml(I18N().weatherLabel(d.code))}</div>
          <div class="temp-bar"><span style="left:${lo}%;width:${Math.max(4, hi - lo)}%"></span></div>
        </div>
        <div class="d-precip">${d.precipProb != null ? Math.round(d.precipProb) + "%" : ""}<div class="muted small" style="font-size:0.72rem">${d.precip != null ? u.precip(d.precip) + " " + u.precipUnit : ""}</div></div>
        <div class="d-range"><strong>${d.tmax != null ? u.temp(d.tmax) : "—"}°</strong> <span class="d-tmin">${d.tmin != null ? u.temp(d.tmin) : "—"}°</span></div>
      </div>`;
    };

    $("daily-rows").innerHTML = state.daily.map((d, i) => rowHtml(d, i)).join("");

    /* Regime-outlook + dag 17–40 */
    const ext = state.extended;
    const hasExt = ext.length > 0;
    show("regime-block", hasExt);
    show("btn-toggle-long", hasExt);
    if (!hasExt) return;

    $("regime-note").textContent = I18N().t("regime_sub");
    $("btn-toggle-long").textContent = state.showLongRange ? I18N().t("regime_hide_days") : I18N().t("regime_show_days");

    /* Groepeer per regime, zoals RegimeOutlook */
    const groups = {};
    for (const d of ext) {
      const key = d.regime && I18N().REGIME_META[d.regime] ? d.regime : "neutraal";
      (groups[key] = groups[key] || []).push(d);
    }
    const rows = Object.entries(groups)
      .map(([key, list]) => ({
        key, count: list.length,
        pct: Math.round((list.length / ext.length) * 100),
        tmax: list.reduce((s, d) => s + (d.tmax || 0), 0) / list.length,
        rain: Math.round(list.reduce((s, d) => s + (d.precipProb || 0), 0) / list.length),
        from: list[0].date, to: list[list.length - 1].date,
      }))
      .sort((a, b) => b.count - a.count);

    $("regime-rows").innerHTML = rows.map(r => {
      const meta = I18N().REGIME_META[r.key];
      const lang = I18N().lang;
      const info = meta[lang] || meta.nl;
      return `<div class="regime-row">
        <span class="r-icon">${meta.icon}</span>
        <div class="r-body">
          <div class="r-head">
            <span class="r-name">${escapeHtml(info.name)}</span>
            <span class="r-days">${escapeHtml(I18N().t("regime_days", { n: r.count }))}</span>
            <span class="r-pct">${r.pct}%</span>
          </div>
          <div class="r-bar"><span style="width:${r.pct}%"></span></div>
          <div class="r-desc">${escapeHtml(info.desc)}</div>
          <div class="r-meta">
            <span>${escapeHtml(I18N().t("regime_avg", { v: `${u.temp(r.tmax)}${u.tempUnit}` }))}</span>
            <span>🌧️ ${r.rain}%</span>
            <span style="margin-left:auto">${fmtDate(r.from, { day: "numeric", month: "short" })} – ${fmtDate(r.to, { day: "numeric", month: "short" })}</span>
          </div>
        </div>
      </div>`;
    }).join("");

    /* Lange-lijst (17–40) onder de regimes */
    let longList = $("daily-rows-long");
    if (!longList) {
      longList = document.createElement("div");
      longList.id = "daily-rows-long";
      $("regime-block").after(longList);
    }
    longList.className = state.showLongRange ? "" : "hidden";
    longList.innerHTML = ext.map((d, i) => rowHtml(d, i + 16)).join("");
  }

  /* ── Pagina: Maker Dashboard ───────────────────────── */
  function renderMaker(learned) {
    const { weights } = Captain().computeWeights();
    const stats = Captain().getStats();
    $("h-captain").textContent = I18N().t("h_captain");
    $("captain-weights").innerHTML = Object.keys(weights).map(m => {
      const name = Captain().MODEL_NAMES[m] || m;
      const w = Math.round(weights[m] * 100);
      return `<div class="weight-row"><span class="w-name">${escapeHtml(name)}</span><div class="w-bar"><span style="width:${w}%"></span></div><span class="w-pct">${w}%</span></div>`;
    }).join("") + `<p class="muted small">${escapeHtml(learned ? I18N().t("weight_learned") : I18N().t("weight_default"))} · ${stats.samples} ${escapeHtml(I18N().t("samples"))}</p>`;

    const insights = Captain().getInsights();
    $("captain-insights").innerHTML = `<h3 class="small muted" style="margin:14px 0 4px">${escapeHtml(I18N().t("captain_insights"))}</h3>` +
      (insights.length
        ? insights.map(i => `<div class="insight-item">${escapeHtml(i.text)}</div>`).join("")
        : `<p class="muted small">${escapeHtml(I18N().t("captain_no_data"))}</p>`);

    const info = state.caeliaInfo || {};
    const regimes = Object.keys(info.regimes || {}).map(r => {
      const meta = I18N().REGIME_META[r];
      return `${meta ? meta[I18N().lang].name : r} (${info.regimes[r]}×)`;
    }).join(" · ");
    $("h-caelia").textContent = I18N().t("h_caelia");
    $("caelia-detail").innerHTML = `
      <p class="muted small">${escapeHtml(I18N().t("caelia_source"))}</p>
      <p><strong>${escapeHtml(I18N().t("caelia_analogs"))}:</strong> ${escapeHtml((info.analogYears || []).join(", ") || "—")}</p>
      <p><strong>${escapeHtml(I18N().t("regime_title"))}:</strong> ${escapeHtml(regimes || "—")}</p>
      <p class="muted small">${state.extended.length} ${escapeHtml(I18N().t("days_word"))} · ${escapeHtml(I18N().t("model_spread"))}</p>`;

    /* Luchtkwaliteit-detail */
    const aq = state.air;
    $("h-air").textContent = I18N().t("ov_air");
    if (!aq) { $("air-content").innerHTML = `<p class="muted small">—</p>`; return; }
    const items = [
      { label: "PM2.5", value: aq.pm2_5 != null ? Math.round(aq.pm2_5) + " µg/m³" : "—" },
      { label: "PM10", value: aq.pm10 != null ? Math.round(aq.pm10) + " µg/m³" : "—" },
      { label: I18N().t("stat_ozone"), value: aq.ozone != null ? Math.round(aq.ozone) + " µg/m³" : "—" },
      { label: "NO₂", value: aq.nitrogen_dioxide != null ? Math.round(aq.nitrogen_dioxide) + " µg/m³" : "—" },
      { label: "UV", value: aq.uv_index != null ? String(Math.round(aq.uv_index * 10) / 10) : "—" },
    ];
    $("air-content").innerHTML = `<div class="air-grid">${items.map(i => `<div class="air-item"><div class="label">${escapeHtml(i.label)}</div><div class="value">${escapeHtml(i.value)}</div></div>`).join("")}</div>`;
  }

  /* ── Statische teksten ─────────────────────────────── */
  function renderStaticTexts() {
    const loc = state.location;
    const t = I18N().t;
    $("tab-home").textContent = t("nav_home");
    $("tab-days40").textContent = t("nav_40");
    $("tab-radar").textContent = t("nav_radar");
    $("tab-maker").textContent = t("nav_maker");
    $("tab-about").textContent = t("nav_about");
    $("h-overview").textContent = t("overview_title");
    $("h-sun").textContent = t("sun_title");
    $("sun-rise-label").textContent = t("sun_rise");
    $("sun-set-label").textContent = t("sun_set");
    $("sun-length-label").textContent = t("sun_length");
    $("h-week").textContent = t("week_title");
    $("radar-legend-label").textContent = t("radar_legend_label");
    $("h-radar").textContent = t("radar_title", { loc: loc.name });
    $("h-about").textContent = t("about_title");
    $("about-text").textContent = t("about_text");
    $("search-input").placeholder = t("search_placeholder");
    $("cookie-text").textContent = t("cookie_text");
    $("cookie-ok").textContent = t("cookie_ok");
    $("link-privacy").textContent = t("privacy_link");
    $("link-terms").textContent = t("terms_link");
    $("footer-days").textContent = t("footer_days", {
      first: "Open-Meteo · MET Norway",
      second: "CAELIA v9",
      loc: loc.name,
    });
    $("footer-sources").textContent = t("footer_bronnen");
    $("footer-disclaimer").textContent = t("footer_ai_disclaimer");
    $("lang-select").value = I18N().lang;
    document.documentElement.lang = I18N().lang;
  }

  /* ── Navigatie ─────────────────────────────────────── */
  function switchPage(page) {
    state.page = page;
    document.querySelectorAll(".page").forEach(el => el.classList.add("hidden"));
    show("page-" + page, true);
    document.querySelectorAll(".nav-tab").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    if (page === "radar" && state.location) {
      window.ClimoraRadar.init(state.location.lat, state.location.lon, "radar-map", 8);
      renderNowcast();
    }
    if (page === "home" && state.location) {
      window.ClimoraRadar.init(state.location.lat, state.location.lon, "radar-mini", 8);
    }
  }

  /* ── Events ────────────────────────────────────────── */
  function wireEvents() {
    $("nav-tabs").addEventListener("click", e => {
      const btn = e.target.closest(".nav-tab");
      if (btn) switchPage(btn.dataset.page);
    });
    $("brand-loc").addEventListener("click", () => switchPage("home"));
    $("btn-open-radar").addEventListener("click", () => switchPage("radar"));
    $("week-strip").addEventListener("click", e => {
      if (e.target.closest(".week-cell")) switchPage("days40");
    });

    $("btn-toggle-long").addEventListener("click", () => {
      state.showLongRange = !state.showLongRange;
      renderDays40();
    });

    let searchTimer = null;
    $("search-btn").addEventListener("click", () => {
      const panel = $("search-panel");
      const wasHidden = panel.classList.contains("hidden");
      show("search-panel", wasHidden);
      if (wasHidden) $("search-input").focus();
    });

    $("search-input").addEventListener("input", e => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      if (q.length < 2) { show("search-results", false); return; }
      searchTimer = setTimeout(async () => {
        try {
          const results = await API().geocodeSearch(q);
          const box = $("search-results");
          if (!results.length) { box.innerHTML = `<div class="search-result muted">${escapeHtml(I18N().t("search_no_results"))}</div>`; show("search-results", true); return; }
          box.innerHTML = results.map(r =>
            `<div class="search-result" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(r.name)}" data-country="${escapeHtml(r.country || "")}" data-cc="${r.countryCode || ""}"><span><strong>${escapeHtml(r.name)}</strong></span><span class="muted small">${escapeHtml([r.admin1, r.country].filter(Boolean).join(", "))}</span></div>`
          ).join("");
          show("search-results", true);
        } catch {
          $("search-results").innerHTML = `<div class="search-result muted">${escapeHtml(I18N().t("search_no_results"))}</div>`;
          show("search-results", true);
        }
      }, 300);
    });

    $("search-results").addEventListener("click", e => {
      const item = e.target.closest(".search-result");
      if (!item || !item.dataset.lat) return;
      show("search-results", false);
      show("search-panel", false);
      $("search-input").value = "";
      saveLocation({ lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon), name: item.dataset.name, country: item.dataset.country, countryCode: item.dataset.cc });
      loadWeather();
    });

    document.addEventListener("click", e => {
      if (!e.target.closest(".search-panel") && !e.target.closest("#search-btn")) {
        show("search-results", false);
      }
    });

    $("lang-select").addEventListener("change", e => {
      I18N().setLang(e.target.value);
      renderStaticTexts();
      if (state.location) loadWeather();
    });

    $("cookie-ok").addEventListener("click", () => {
      try { localStorage.setItem("climora_cookie_accepted", "1"); } catch { /* negeer */ }
      show("cookie-notice", false);
    });
  }

  /* ── Live klok ─────────────────────────────────────── */
  function tickClock() {
    $("live-clock").textContent = I18N().t("live_label", {
      time: new Date().toLocaleTimeString(I18N().locale(), { hour: "2-digit", minute: "2-digit" }),
    });
  }

  /* ── Boot ──────────────────────────────────────────── */
  async function boot() {
    setLoadingStep("load_weather");
    wireEvents();
    tickClock();
    setInterval(tickClock, 30000);
    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          if (state.daily.length) renderHours24();
          if (state.daily.length) renderSun(state.daily[0]);
        });
      } catch { /* oudere browsers */ }
    }
    try {
      if (!localStorage.getItem("climora_cookie_accepted")) show("cookie-notice", true);
    } catch { /* negeer */ }
    setLoadingStep("load_locate");
    state.location = await resolveLocation();
    await loadWeather();
  }

  boot();
})();
