/* ClimoraWeather — orchestratie: locatie, data, AI-lagen en weergave.
 * Opstartvolgorde: opgeslagen locatie → GPS → IP-fallback; AI Captain-leerpipeline;
 * multi-model data; CAELIA voor dag 17–40; render publiek/pro. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const I18N = () => window.ClimoraI18N;
  const API = () => window.ClimoraAPI;
  const Captain = () => window.ClimoraCaptain;
  const Caelia = () => window.ClimoraCaelia;

  const state = {
    location: null,
    mode: localStorage.getItem("climora_mode") || "publiek",
    daily: [],      /* dag 1–16 gewogen + gecorrigeerd */
    extended: [],   /* dag 17–40 (CAELIA) */
    hourly: [],
    units: null,
    caeliaInfo: null,
  };

  /* ── Helpers ───────────────────────────────────────── */
  function fmtDate(dateStr, fmt) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString(I18N().locale(), fmt || { weekday: "short", day: "numeric", month: "short" });
  }
  function dayName(dateStr, idx) {
    if (idx === 0) return I18N().t("today");
    if (idx === 1) return I18N().t("tomorrow");
    return fmtDate(dateStr, { weekday: "short" });
  }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }

  function pct(arr, p) {
    const v = arr.filter(x => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    const idx = (v.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return v[lo] + (v[hi] - v[lo]) * (idx - lo);
  }

  /* ── Locatie ───────────────────────────────────────── */
  function saveLocation(loc) {
    state.location = loc;
    localStorage.setItem("climora_selected_location", JSON.stringify(loc));
  }

  async function resolveLocation() {
    const saved = localStorage.getItem("climora_selected_location");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* corrupte opslag: verder met detectie */ }
    }
    try {
      const gps = await API().gpsLocate();
      const rev = await API().reverseGeocode(gps.lat, gps.lon);
      return Object.assign(gps, rev);
    } catch {
      return await API().ipLocate();
    }
  }

  /* ── Data ophalen en combineren ────────────────────── */
  async function loadWeather() {
    const loc = state.location;
    if (!loc) return;
    const u = I18N().unitsForCountry(loc.countryCode);
    state.units = u;

    $("loading-text").textContent = I18N().t("loading");
    show("loading", true);
    show("error-banner", false);

    const locKey = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;

    const [modelsRes, metNoRes, hourlyRes, airRes, warningsRes, archiveRes] = await Promise.allSettled([
      Promise.all(API().OM_MODELS.map(m => API().fetchOmModel(loc.lat, loc.lon, m.id))),
      API().fetchMetNo(loc.lat, loc.lon),
      API().fetchHourly(loc.lat, loc.lon),
      API().fetchAirQuality(loc.lat, loc.lon),
      API().fetchWarnings(loc.countryCode),
      API().fetchArchive(loc.lat, loc.lon),
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
      show("loading", false);
      $("error-banner").textContent = I18N().t("errorLoad");
      show("error-banner", true);
      return;
    }

    /* AI Captain: eerst verifiëren, dan gewichten leren */
    $("loading-text").textContent = I18N().t("loadingCaptain");
    try { await Captain().verifyAndLearn(locKey, loc.lat, loc.lon); } catch { /* lokaal leren mag never breken */ }
    const { weights, learned } = Captain().computeWeights();

    /* Multi-model gewogen combinatie met bias-correctie */
    const base = models[0].daily;
    const nDays = Math.min(16, base.time.length);
    const daily = [];
    for (let i = 0; i < nDays; i++) {
      const date = base.time[i];
      const lead = i + 1;
      const perVar = { tmax: [], tmin: [], precip: [], tmaxP10: [], tmaxP90: [], pressure: [] };
      for (const m of models) {
        const d = m.daily;
        if (!d || !d.time || d.time[i] !== date) continue;
        const w = weights[m.modelId] || 0.05;
        if (d.temperature_2m_max[i] != null) perVar.tmax.push([d.temperature_2m_max[i] - Captain().getBias(m.modelId, lead, "tmax"), w]);
        if (d.temperature_2m_min[i] != null) perVar.tmin.push([d.temperature_2m_min[i] - Captain().getBias(m.modelId, lead, "tmin"), w]);
        if (d.precipitation_sum[i] != null) perVar.precip.push([Math.max(0, d.precipitation_sum[i] - Captain().getBias(m.modelId, lead, "precip")), w]);
        if (d.temperature_2m_max[i] != null) { perVar.tmaxP10.push(d.temperature_2m_max[i]); perVar.tmaxP90.push(d.temperature_2m_max[i]); }
        if (d.pressure_msl && d.pressure_msl[i] != null) perVar.pressure.push(d.pressure_msl[i]);
      }
      const wmean = pairs => {
        const tw = pairs.reduce((s, p) => s + p[1], 0);
        return tw ? pairs.reduce((s, p) => s + p[0] * p[1], 0) / tw : null;
      };
      const tmax = wmean(perVar.tmax);
      const tmin = wmean(perVar.tmin);
      const spread = pct(perVar.tmaxP10, 0.1);
      const spreadHi = pct(perVar.tmaxP90, 0.9);
      daily.push({
        date,
        tmax, tmin,
        tmaxP10: spread != null && tmax != null ? Math.round((tmax - Math.max(0.4, (spreadHi - spread) / 2)) * 10) / 10 : null,
        tmaxP90: spreadHi != null && tmax != null ? Math.round((tmax + Math.max(0.4, (spreadHi - spread) / 2)) * 10) / 10 : null,
        precip: wmean(perVar.precip),
        precipProb: pct(models.map(m => m.daily && m.daily.precipitation_probability_max ? m.daily.precipitation_probability_max[i] : null), 0.5),
        wind: wmean(models.map(m => m.daily && m.daily.wind_speed_10m_max ? [m.daily.wind_speed_10m_max[i], weights[m.modelId] || 0.05] : null).filter(Boolean)),
        windDir: pct(models.map(m => m.daily && m.daily.wind_direction_10m_dominant ? m.daily.wind_direction_10m_dominant[i] : null), 0.5),
        code: (() => { const c = pct(models.map(m => m.daily && m.daily.weather_code ? m.daily.weather_code[i] : null), 0.5); return c == null ? 3 : Math.round(c); })(),
        pressure: wmean(perVar.pressure.map(p => [p, 1])),
        source: "models",
      });
    }
    state.daily = daily;

    /* CAELIA: dag 17–40 */
    $("loading-text").textContent = I18N().t("loadingCaelia");
    const archive = archiveRes.status === "fulfilled" ? archiveRes.value : null;
    const profile = Caelia().buildClimateProfile(archive);
    const ext = Caelia().extendTo40(daily, profile, archive, Captain().hasLearning());
    state.extended = ext.days;
    state.caeliaInfo = { analogYears: ext.analogYears, regimes: ext.regimes, hasProfile: !!profile };

    /* Leermetingen vastleggen voor de volgende cyclus */
    try { Captain().recordPredictions(locKey, models); } catch { /* negeer */ }

    /* Overige bronnen */
    state.hourly = hourlyRes.status === "fulfilled" ? hourlyRes.value : [];
    const air = airRes.status === "fulfilled" ? airRes.value : null;
    const warnings = warningsRes.status === "fulfilled" ? warningsRes.value : [];

    show("loading", false);
    renderAll(loc, air, warnings, learned);
  }

  /* ── Weergave ──────────────────────────────────────── */
  function renderAll(loc, air, warnings, learned) {
    const u = state.units;
    $("location-name").textContent = loc.name + (loc.country ? `, ${loc.country}` : "");
    $("location-meta").textContent = `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`;
    show("location-bar", true);

    renderWarnings(warnings);
    renderHero();
    renderOutdoor();
    renderHourly();
    renderDaily();
    renderRegimes();
    renderAir(air);
    renderPro(learned);

    show("hero", true); show("outdoor-card", true); show("hourly-card", true);
    show("daily-card", true); show("regime-card", true); show("radar-card", true); show("air-card", true);
    document.querySelectorAll(".pro-only").forEach(el => el.classList.toggle("hidden", state.mode !== "pro"));

    window.ClimoraRadar.init(loc.lat, loc.lon);
  }

  function renderWarnings(warnings) {
    const el = $("warnings-banner");
    if (!warnings || !warnings.length) { show("warnings-banner", false); return; }
    el.innerHTML = warnings.map(w =>
      `<div class="warn-item"><span class="warn-level">⚠️</span><strong>${escapeHtml(w.event)}</strong>` +
      (w.area ? ` — ${escapeHtml(w.area)}` : "") + `</div>`
    ).join("");
    show("warnings-banner", true);
  }

  function renderHero() {
    const u = state.units;
    const h = state.hourly[0];
    const d0 = state.daily[0];
    const code = h ? h.code : (d0 ? d0.code : 3);
    const hour = new Date().getHours();
    const isDay = hour >= 6 && hour < 21;
    $("hero-icon").innerHTML = window.ClimoraIcons.svg(code, isDay);
    $("hero-desc").textContent = I18N().weatherLabel(code);
    $("hero-temp").textContent = h && h.temp != null ? `${Math.round(u.convertTemp(h.temp))}${u.temp}` : (d0 && d0.tmax != null ? `${Math.round(u.convertTemp(d0.tmax))}${u.temp}` : "—");
    $("hero-feels").textContent = d0 && d0.tmin != null && d0.tmax != null
      ? `${I18N().t("feelsLike")} ${Math.round(u.convertTemp((d0.tmax + d0.tmin) / 2))}${u.temp} · min ${Math.round(u.convertTemp(d0.tmin))}${u.temp}` : "";

    const stats = [];
    if (h && h.wind != null) stats.push({ label: I18N().t("wind"), value: `${Math.round(u.convertWind(h.wind))} ${u.wind}` });
    if (d0 && d0.precip != null) stats.push({ label: I18N().t("precip"), value: `${u.convertPrecip(d0.precip).toFixed(u.dec)} ${u.precip}` });
    if (d0 && d0.precipProb != null) stats.push({ label: "%", value: `${Math.round(d0.precipProb)}%` });
    if (d0 && d0.pressure != null) stats.push({ label: I18N().t("pressure"), value: `${Math.round(d0.pressure)} hPa` });
    $("hero-stats").innerHTML = stats.map(s => `<div class="hero-stat"><div class="label">${s.label}</div><div class="value">${s.value}</div></div>`).join("");
  }

  function outdoorScore(day) {
    if (!day) return null;
    let score = 10;
    if (day.tmax != null) {
      if (day.tmax > 30) score -= (day.tmax - 30) * 0.5;
      if (day.tmax < 5) score -= (5 - day.tmax) * 0.4;
    }
    if (day.wind != null) score -= Math.max(0, (day.wind * 3.6 - 25)) * 0.06;
    if (day.precip != null) score -= Math.min(4, day.precip * 0.7);
    if (day.precipProb != null) score -= (day.precipProb / 100) * 2;
    return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  }

  function renderOutdoor() {
    const today = outdoorScore(state.daily[0]);
    if (today == null) return;
    $("outdoor-score").textContent = today.toFixed(1);
    const color = today >= 7 ? "var(--good)" : today >= 4 ? "var(--warn)" : "var(--danger)";
    $("outdoor-score").style.color = color;
    $("outdoor-score").style.borderColor = color;
    const bars = [];
    for (let i = 0; i < Math.min(5, state.daily.length); i++) {
      const s = outdoorScore(state.daily[i]);
      bars.push({ day: dayName(state.daily[i].date, i), s });
    }
    $("outdoor-detail").innerHTML = `<div class="muted small">${I18N().t("outdoorHint")}</div>` +
      bars.map(b => `<div class="bar"><span style="width:${(b.s / 10) * 100}%;background:${b.s >= 7 ? "var(--good)" : b.s >= 4 ? "var(--warn)" : "var(--danger)"}"></span></div><div class="muted small" style="margin-top:-8px;margin-bottom:6px">${b.day}: ${b.s.toFixed(1)}</div>`).join("");
  }

  function renderHourly() {
    const u = state.units;
    const hours = state.hourly.slice(0, 48).map(h => ({
      ...h,
      label: new Date(h.time).toLocaleTimeString(I18N().locale(), { hour: "2-digit" }),
    }));
    if (hours.length < 2) { show("hourly-card", false); return; }
    window.ClimoraChart.drawHourlyChart($("hourly-chart"), hours);
    $("hourly-strip").innerHTML = hours.filter((_, i) => i % 3 === 0).map(h => `
      <div class="hour-cell">
        <div class="h-time">${h.label}</div>
        <div class="h-icon">${window.ClimoraIcons.svg(h.code, true)}</div>
        <div class="h-temp">${Math.round(u.convertTemp(h.temp))}${u.temp}</div>
        <div class="h-precip">${h.precipProb != null ? Math.round(h.precipProb) + "%" : ""}</div>
      </div>`).join("");
  }

  function renderDaily() {
    const u = state.units;
    const all = state.daily;
    if (!all.length) return;
    const gMin = Math.min(...all.map(d => d.tminP10 != null ? d.tminP10 : d.tmin).filter(v => v != null));
    const gMax = Math.max(...all.map(d => d.tmaxP90 != null ? d.tmaxP90 : d.tmax).filter(v => v != null));
    const span = Math.max(1, gMax - gMin);

    $("daily-rows").innerHTML = all.map((d, i) => {
      const lo = ((d.tmin - gMin) / span) * 100;
      const hi = ((d.tmax - gMin) / span) * 100;
      return `<div class="day-row">
        <div class="d-name">${dayName(d.date, i)} ${fmtDate(d.date, { day: "numeric", month: "numeric" })}</div>
        <div class="d-icon">${window.ClimoraIcons.svg(d.code, true)}</div>
        <div class="temp-bar"><span style="left:${lo}%;width:${Math.max(4, hi - lo)}%"></span></div>
        <div class="d-range"><strong>${Math.round(u.convertTemp(d.tmax))}°</strong> <span class="d-tmin">${Math.round(u.convertTemp(d.tmin))}°</span></div>
        <div class="d-range d-tmin">${d.tmaxP10 != null ? `${Math.round(u.convertTemp(d.tmaxP10))}–${Math.round(u.convertTemp(d.tmaxP90))}°` : ""}</div>
        <div class="d-precip">${d.precipProb != null ? Math.round(d.precipProb) + "%" : ""} ${d.precip != null ? u.convertPrecip(d.precip).toFixed(1) + " " + u.precip : ""}</div>
      </div>`;
    }).join("");
  }

  function renderRegimes() {
    const u = state.units;
    const ext = state.extended;
    if (!ext.length) { show("regime-card", false); return; }
    $("regime-note").textContent = I18N().t("regimeNote");

    /* Groepeer per regime-blok */
    const groups = [];
    for (const d of ext) {
      const last = groups[groups.length - 1];
      if (last && last.regime === d.regime) { last.days.push(d); }
      else groups.push({ regime: d.regime, label: d.regimeLabel, days: [d] });
    }
    $("regime-rows").innerHTML = groups.map(g => {
      const first = g.days[0].date, lastD = g.days[g.days.length - 1].date;
      const tmaxs = g.days.flatMap(d => [d.tmaxP10, d.tmaxP90]).filter(v => v != null);
      const lo = Math.round(u.convertTemp(Math.min(...tmaxs)));
      const hi = Math.round(u.convertTemp(Math.max(...tmaxs)));
      const precip = g.days.reduce((s, d) => s + (d.precip || 0), 0);
      return `<div class="regime-row">
        <div class="r-dates">${fmtDate(first, { day: "numeric", month: "short" })} – ${fmtDate(lastD, { day: "numeric", month: "short" })}</div>
        <span class="regime-badge">${escapeHtml(g.label)}</span>
        <span class="muted">${lo}–${hi}${u.temp} · ${u.convertPrecip(precip).toFixed(0)} ${u.precip} ${I18N().t("precip").toLowerCase()}</span>
      </div>`;
    }).join("");
  }

  function renderAir(air) {
    const el = $("air-content");
    if (!air) { show("air-card", false); return; }
    const aqi = air.european_aqi;
    const label = aqi == null ? "—" :
      aqi <= 20 ? I18N().t("aqiGood") : aqi <= 40 ? I18N().t("aqiFair") : aqi <= 60 ? I18N().t("aqiModerate") :
      aqi <= 80 ? I18N().t("aqiPoor") : aqi <= 100 ? I18N().t("aqiVeryPoor") : I18N().t("aqiExtremelyPoor");
    const items = [
      { label: I18N().t("aqi"), value: aqi != null ? `${Math.round(aqi)} — ${label}` : "—" },
      { label: I18N().t("pm25"), value: air.pm2_5 != null ? air.pm2_5.toFixed(0) + " µg/m³" : "—" },
      { label: I18N().t("pm10"), value: air.pm10 != null ? air.pm10.toFixed(0) + " µg/m³" : "—" },
      { label: I18N().t("ozone"), value: air.ozone != null ? air.ozone.toFixed(0) + " µg/m³" : "—" },
      { label: I18N().t("no2"), value: air.nitrogen_dioxide != null ? air.nitrogen_dioxide.toFixed(0) + " µg/m³" : "—" },
    ];
    el.innerHTML = `<div class="air-grid">${items.map(i => `<div class="air-item"><div class="label">${i.label}</div><div class="value">${i.value}</div></div>`).join("")}</div>`;
  }

  function renderPro(learned) {
    const { weights } = Captain().computeWeights();
    const stats = Captain().getStats();
    $("captain-weights").innerHTML = Object.keys(weights).map(m => {
      const name = Captain().MODEL_NAMES[m] || m;
      const pctW = Math.round(weights[m] * 100);
      return `<div class="weight-row"><span class="w-name">${name}</span><div class="w-bar"><span style="width:${pctW}%"></span></div><span class="w-pct">${pctW}%</span></div>`;
    }).join("") + `<p class="muted small">${learned ? I18N().t("weightLearned") + " · " + stats.samples + " " + I18N().t("samples") : I18N().t("weightDefault")}</p>`;

    const insights = Captain().getInsights();
    $("captain-insights").innerHTML = `<h3 class="small muted" style="margin:14px 0 4px">${I18N().t("captainInsights")}</h3>` +
      (insights.length
        ? insights.map(i => `<div class="insight-item">${escapeHtml(i.text)}</div>`).join("")
        : `<p class="muted small">${I18N().t("captainNoData")}</p>`);

    const info = state.caeliaInfo || {};
    const regimes = Object.keys(info.regimes || {}).map(r => {
      const meta = Caelia().REGIMES[r];
      return `${meta ? meta.label : r} (${info.regimes[r]}×)`;
    }).join(" · ");
    $("caelia-detail").innerHTML = `
      <p class="muted small">${I18N().t("caeliaSource")}</p>
      <p><strong>${I18N().t("caeliaRegimes")}:</strong> ${regimes || "—"}</p>
      <p><strong>${I18N().t("caeliaAnalogs")}:</strong> ${(info.analogYears || []).join(", ") || "—"}</p>
      <p class="muted small">${state.extended.length} ${I18N().t("days")} · ${I18N().t("modelSpread")}</p>`;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ── Events ────────────────────────────────────────── */
  function applyMode() {
    const pro = state.mode === "pro";
    $("mode-toggle").textContent = pro ? "Pro" : "Publiek";
    document.querySelectorAll(".pro-only").forEach(el => el.classList.toggle("hidden", !pro));
    localStorage.setItem("climora_mode", state.mode);
  }

  function applyLang() {
    document.documentElement.lang = I18N().lang;
    $("search-input").placeholder = I18N().t("searchPlaceholder");
    $("lang-select").value = I18N().lang;
    $("h-outdoor").textContent = I18N().t("hOutdoor");
    $("h-hourly").textContent = I18N().t("hHourly");
    $("h-daily").textContent = I18N().t("hDaily");
    $("h-regime").textContent = I18N().t("hRegime");
    $("h-radar").textContent = I18N().t("hRadar");
    $("h-air").textContent = I18N().t("hAir");
    $("h-captain").textContent = I18N().t("hCaptain");
    $("h-caelia").textContent = I18N().t("hCaelia");
  }

  function wireEvents() {
    let searchTimer = null;
    $("search-input").addEventListener("input", e => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      if (q.length < 2) { show("search-results", false); return; }
      searchTimer = setTimeout(async () => {
        try {
          const results = await API().geocodeSearch(q);
          const box = $("search-results");
          if (!results.length) { box.innerHTML = `<div class="search-result muted">${I18N().t("noResults")}</div>`; show("search-results", true); return; }
          box.innerHTML = results.map(r =>
            `<div class="search-result" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(r.name)}" data-country="${escapeHtml(r.country || "")}" data-cc="${r.countryCode || ""}"><span>${escapeHtml(r.name)}</span><span class="muted small">${escapeHtml([r.admin1, r.country].filter(Boolean).join(", "))}</span></div>`
          ).join("");
          show("search-results", true);
        } catch {
          $("search-results").innerHTML = `<div class="search-result muted">${I18N().t("errorSearch")}</div>`;
          show("search-results", true);
        }
      }, 300);
    });

    $("search-results").addEventListener("click", e => {
      const item = e.target.closest(".search-result");
      if (!item || !item.dataset.lat) return;
      show("search-results", false);
      $("search-input").value = "";
      saveLocation({ lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon), name: item.dataset.name, country: item.dataset.country, countryCode: item.dataset.cc });
      loadWeather();
    });

    document.addEventListener("click", e => {
      if (!e.target.closest(".search-wrap")) show("search-results", false);
    });

    $("lang-select").addEventListener("change", e => {
      I18N().setLang(e.target.value);
      applyLang();
      if (state.location) loadWeather();
    });

    $("mode-toggle").addEventListener("click", () => {
      state.mode = state.mode === "pro" ? "publiek" : "pro";
      applyMode();
    });

    $("btn-favorite").addEventListener("click", () => {
      if (!state.location) return;
      const favs = JSON.parse(localStorage.getItem("climora_favorite_locations") || "[]");
      if (!favs.some(f => f.lat === state.location.lat && f.lon === state.location.lon)) {
        favs.push(state.location);
        localStorage.setItem("climora_favorite_locations", JSON.stringify(favs.slice(-8)));
      }
      $("btn-favorite").textContent = "★";
    });
  }

  /* ── Boot ──────────────────────────────────────────── */
  async function boot() {
    applyLang();
    applyMode();
    wireEvents();
    state.location = await resolveLocation();
    await loadWeather();
  }

  boot();
})();
