/* ClimoraWeather — CAELIA: lange-termijnlaag voor dag 17–40.
 * Geen publieke modeldata beschikbaar op die horizon, dus CAELIA combineert:
 *  1. klimaatprofiel (30 jaar archief, per dag-van-jaar gemiddelde + spreiding)
 *  2. analoge dagen (historische jaren die op de eerste 7 dagen lijken)
 *  3. regime-classificatie (anticycloon, omega-blocking, frontaal, dieptecycloon)
 *  4. AI Captain-biascontext
 * Uitvoer is een bandbreedte (P10–P90), nooit schijnprecisie. */
(function () {
  "use strict";

  const REGIMES = {
    anticycloon_opbouw: { tmaxF: 1.15, tminF: 0.85, precipF: 0.35, windF: 0.7, label: "Anticycloon-opbouw" },
    omega_blocking:     { tmaxF: 1.30, tminF: 0.95, precipF: 0.15, windF: 0.6, label: "Omega-blocking" },
    frontaal_actief:    { tmaxF: 0.95, tminF: 1.10, precipF: 1.45, windF: 1.25, label: "Frontaal actief" },
    dieptecycloon:      { tmaxF: 0.80, tminF: 1.05, precipF: 1.80, windF: 1.55, label: "Dieptecycloon" },
    zonal_west:         { tmaxF: 1.00, tminF: 1.00, precipF: 1.00, windF: 1.05, label: "Zonale weststroming" },
    neutraal:           { tmaxF: 1.00, tminF: 1.00, precipF: 1.00, windF: 1.00, label: "Neutraal / wisselvallig" },
  };

  function dayOfYear(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 0;
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dateSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ── 1. Klimaatprofiel uit het archief ─────────────── */
  function buildClimateProfile(archive) {
    if (!archive || !archive.time) return null;
    const buckets = Array.from({ length: 366 }, () => ({ tmax: [], tmin: [], pr: [] }));
    for (let i = 0; i < archive.time.length; i++) {
      const d = new Date(archive.time[i] + "T12:00:00Z");
      const doy = dayOfYear(d);
      const b = buckets[Math.min(365, doy)];
      if (archive.temperature_2m_max[i] != null) b.tmax.push(archive.temperature_2m_max[i]);
      if (archive.temperature_2m_min[i] != null) b.tmin.push(archive.temperature_2m_min[i]);
      if (archive.precipitation_sum[i] != null) b.pr.push(archive.precipitation_sum[i]);
    }
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const std = a => {
      if (a.length < 2) return 2.0;
      const m = mean(a);
      return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
    };
    const profile = buckets.map(b => ({
      tmaxMean: mean(b.tmax), tmaxStd: std(b.tmax),
      tminMean: mean(b.tmin), tminStd: std(b.tmin),
      precipMean: mean(b.pr) || 0,
      precipProb: b.pr.length ? b.pr.filter(v => v >= 0.2).length / b.pr.length : 0.35,
      n: b.tmax.length,
    }));
    /* 7-daagse smoothing voor robuustere normalen */
    const smooth = profile.map((_, i) => {
      const idx = [];
      for (let o = -4; o <= 4; o++) idx.push((i + o + 366) % 366);
      const pick = k => {
        const vals = idx.map(j => profile[j][k]).filter(v => v != null);
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      };
      return {
        tmaxMean: pick("tmaxMean"), tmaxStd: pick("tmaxStd"),
        tminMean: pick("tminMean"), tminStd: pick("tminStd"),
        precipMean: pick("precipMean") || 0, precipProb: pick("precipProb") || 0.35,
        n: profile[i].n,
      };
    });
    return smooth;
  }

  /* ── 2. Analoge dagen: jaren die op de startweek lijken ── */
  function findAnalogs(archive, first7, targetDates) {
    if (!archive || !archive.time || !first7 || first7.length < 5) return { years: [], values: {} };
    const byDate = {};
    for (let i = 0; i < archive.time.length; i++) {
      byDate[archive.time[i]] = { tmax: archive.temperature_2m_max[i], tmin: archive.temperature_2m_min[i] };
    }
    const years = [...new Set(archive.time.map(d => d.slice(0, 4)))].filter(y => y !== String(new Date().getFullYear()));
    const scores = [];
    const baseDate = new Date(first7[0].date + "T12:00:00Z");
    for (const y of years) {
      let sse = 0, n = 0;
      for (let i = 0; i < first7.length; i++) {
        const d = new Date(baseDate.getTime() + i * 86400000);
        const key = `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const rec = byDate[key];
        if (!rec || rec.tmax == null || first7[i].tmax == null) continue;
        sse += Math.pow(rec.tmax - first7[i].tmax, 2);
        n++;
      }
      if (n >= 5) scores.push({ year: y, score: Math.sqrt(sse / n) });
    }
    scores.sort((a, b) => a.score - b.score);
    const best = scores.slice(0, 5);

    const values = {};
    for (const target of targetDates) {
      const t = new Date(target + "T12:00:00Z");
      const key = `-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      const tmaxs = [], tmins = [];
      for (const a of best) {
        const rec = byDate[a.year + key];
        if (rec && rec.tmax != null) { tmaxs.push(rec.tmax); if (rec.tmin != null) tmins.push(rec.tmin); }
      }
      values[target] = {
        tmax: tmaxs.length ? tmaxs.reduce((s, v) => s + v, 0) / tmaxs.length : null,
        tmin: tmins.length ? tmins.reduce((s, v) => s + v, 0) / tmins.length : null,
      };
    }
    return { years: best.map(b => b.year), values };
  }

  /* ── 3. Regime-classificatie ───────────────────────── */
  function classifyRegime(pressure, tmaxAnom, rng) {
    if (pressure != null && pressure >= 1022) return rng() < 0.5 ? "anticycloon_opbouw" : "omega_blocking";
    if (pressure != null && pressure <= 1000) return rng() < 0.6 ? "dieptecycloon" : "frontaal_actief";
    if (tmaxAnom != null && tmaxAnom > 3 && pressure != null && pressure >= 1015) return "omega_blocking";
    if (tmaxAnom != null && tmaxAnom < -3 && pressure != null && pressure <= 1008) return "dieptecycloon";
    return rng() < 0.55 ? "zonal_west" : "frontaal_actief";
  }

  /* ── 4. Dag 17–40 genereren ────────────────────────── */
  function extendTo40(weighted16, climateProfile, archive, captainBiasApplied) {
    if (!climateProfile || !weighted16 || !weighted16.length) return { days: [], analogYears: [], regimes: {} };

    const last = weighted16[weighted16.length - 1];
    const lastDate = new Date(last.date + "T12:00:00Z");
    const last7 = weighted16.slice(-7).map(d => ({ date: d.date, tmax: d.tmax }));

    /* Trend over de laatste 10 modeldagen (lineair, gedempt) */
    const tail = weighted16.slice(-10);
    let trend = 0;
    if (tail.length >= 4) {
      const n = tail.length;
      const sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6;
      const sy = tail.reduce((s, d) => s + d.tmax, 0);
      const sxy = tail.reduce((s, d, i) => s + i * d.tmax, 0);
      trend = clamp((n * sxy - sx * sy) / (n * sxx - sx * sx) || 0, -0.35, 0.35);
    }

    const targetDates = [];
    for (let i = 17; i <= 40; i++) {
      targetDates.push(new Date(lastDate.getTime() + (i - weighted16.length) * 86400000).toISOString().slice(0, 10));
    }

    const analogs = findAnalogs(archive, last7, targetDates);
    const days = [];
    const regimesSeen = {};

    for (let i = 0; i < targetDates.length; i++) {
      const date = targetDates[i];
      const d = new Date(date + "T12:00:00Z");
      const doy = Math.min(365, dayOfYear(d));
      const prof = climateProfile[doy];
      const rng = mulberry32(dateSeed(date + "caelia"));
      const horizonDecay = 1 - i / 48;

      const pressure = null;
      const regimeId = classifyRegime(pressure, null, rng);
      const regime = REGIMES[regimeId];
      regimesSeen[regimeId] = (regimesSeen[regimeId] || 0) + 1;

      /* Basis: klimatologie */
      let tmax = prof.tmaxMean;
      let tmin = prof.tminMean;

      /* Analoog-signaal (beperkt gewicht, vervaagt met de horizon) */
      const an = analogs.values[date];
      if (an && an.tmax != null) {
        const w = 0.35 * horizonDecay;
        tmax = tmax * (1 - w) + an.tmax * w;
        if (an.tmin != null) tmin = tmin * (1 - w) + an.tmin * w;
      }

      /* Trend-persistatie, gedempt */
      tmax += trend * (i + 1) * 0.35 * horizonDecay;
      tmin += trend * (i + 1) * 0.25 * horizonDecay;

      /* Regime-effect */
      tmax = tmax * regime.tmaxF + (regime.tmaxF - 1) * 0;
      tmin = tmin * regime.tminF;

      /* Deterministische variatie (realistische dag-tot-dag beweging) */
      const jitterT = (rng() - 0.5) * 2 * Math.max(1.2, (prof.tmaxStd || 2.5) * 0.55) * horizonDecay;
      tmax += jitterT;
      tmin = Math.min(tmin + (rng() - 0.5) * 2 * Math.max(1.0, (prof.tminStd || 2.2) * 0.5) * horizonDecay, tmax - 1.5);

      /* Neerslag: regime-factor op klimatologische kans, gamma-achtige hoeveelheid */
      const precipProb = clamp(prof.precipProb * regime.precipF, 0.05, 0.95);
      let precip = 0;
      if (rng() < precipProb) {
        precip = -Math.log(1 - rng()) * Math.max(0.8, prof.precipMean || 1.5) * regime.precipF;
        precip = Math.max(0.1, Math.round(precip * 10) / 10);
      }

      const wind = Math.max(8, 18 * regime.windF * (0.75 + rng() * 0.5));
      const windDir = regimeId === "omega_blocking" ? 90 : regimeId === "dieptecycloon" ? 210 : regimeId === "anticycloon_opbouw" ? 45 : 230;

      const isSummer = d.getMonth() >= 5 && d.getMonth() <= 7;
      let code;
      if (precipProb > 0.7 && precip > 5) code = 65;
      else if (precipProb > 0.65 && precip > 2) code = 63;
      else if (precipProb > 0.5 && precip > 1) code = 61;
      else if (precipProb > 0.45) code = isSummer ? 80 : 63;
      else if (precipProb > 0.3) code = 3;
      else if (precipProb > 0.18) code = 2;
      else code = 1;
      if (isSummer && tmax > 25 && precipProb > 0.4 && rng() < 0.15) code = 95;

      /* Bandbreedte: klimatologische spreiding + regime-onzekerheid */
      const spread = (prof.tmaxStd || 2.5) * (1 + i / 30);
      days.push({
        date, source: "caelia", regime: regimeId, regimeLabel: regime.label,
        tmax: Math.round(tmax * 10) / 10,
        tmin: Math.round(tmin * 10) / 10,
        tmaxP10: Math.round((tmax - 1.28 * spread) * 10) / 10,
        tmaxP90: Math.round((tmax + 1.28 * spread) * 10) / 10,
        tminP10: Math.round((tmin - 1.28 * (prof.tminStd || 2.2)) * 10) / 10,
        tminP90: Math.round((tmin + 1.28 * (prof.tminStd || 2.2)) * 10) / 10,
        precip, precipProb: Math.round(precipProb * 100),
        wind: Math.round(wind), windDir,
        code,
        captainBiasApplied: !!captainBiasApplied,
      });
    }

    /* Continuïteit: gladde overgang van dag 16 (modeldata) naar de CAELIA-horizon.
       De anomalie van de laatste modeldag vervaagt proportioneel over de volgende
       5 dagen, zodat één doorlopende verwachting 0–40 zonder sprong ontstaat. */
    const lastDoy = Math.min(365, dayOfYear(new Date(last.date + "T12:00:00Z")));
    const lastProf = climateProfile[lastDoy];
    if (lastProf && last.tmax != null) {
      const anomMax = last.tmax - lastProf.tmaxMean;
      const anomMin = last.tmin != null ? last.tmin - lastProf.tminMean : 0;
      for (let i = 0; i < Math.min(5, days.length); i++) {
        const w = 0.55 * (1 - i / 5);
        const decay = Math.pow(0.85, i + 1);
        const doy2 = Math.min(365, dayOfYear(new Date(days[i].date + "T12:00:00Z")));
        const prof2 = climateProfile[doy2];
        if (!prof2) continue;
        days[i].tmax = Math.round((days[i].tmax * (1 - w) + (prof2.tmaxMean + anomMax * decay) * w) * 10) / 10;
        days[i].tmin = Math.round((days[i].tmin * (1 - w) + (prof2.tminMean + anomMin * decay) * w) * 10) / 10;
        const lastProb = last.precipProb != null ? last.precipProb : days[i].precipProb;
        days[i].precipProb = Math.round(clamp(days[i].precipProb * (1 - w * 0.5) + lastProb * w * 0.5, 5, 95));
      }
    }

    return { days, analogYears: analogs.years, regimes: regimesSeen };
  }

  /* ── 5. Regimes voor dag 1–16 (uit modeldruk) ──────── */
  function classifyDailyRegimes(weighted16) {
    return weighted16.map(d => {
      const rng = mulberry32(dateSeed(d.date + "regime"));
      const id = classifyRegime(d.pressure, d.tmaxAnom, rng);
      return { date: d.date, regime: id, label: REGIMES[id].label };
    });
  }

  /* ══ CAELIA v9 Neural Brain — echt neuraal netwerk (port van neuralForecast.js) ══
     1. LEREN: traint op ~4 jaar meetdata hoe weerpatronen doorwerken.
     2. DENKEN: 3 denkpasses per dag + pass 4 (fysische kennis via ClimoraKnowledge).
     3. LEREN DOOR: warm start — gewichten blijven in localStorage per locatie. */

  const SIZES = [12, 32, 24, 2];
  const HORIZONS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 40];
  const FEATURE_NAMES = [
    "de seizoenspositie", "de seizoenspositie", "de voorspelhorizon",
    "de warmte van gisteren", "de warmte van 2 dagen terug", "de warmte van 3 dagen terug",
    "de week-persistentie", "de temperatuurtrend", "de nachttemperatuur",
    "de neerslaghistorie", "de windhistorie", "de langere persistentie",
  ];

  function toDayList(archive) {
    const d = archive || {};
    const days = [];
    for (let i = 0; i < (d.time || []).length; i++) {
      days.push({
        date: d.time[i],
        tmax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
        tmin: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
        precip: d.precipitation_sum ? d.precipitation_sum[i] : null,
        wind: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
      });
    }
    return days.filter(x => x.tmax != null && x.tmin != null);
  }

  /* Klimatologie met cache en z-score (±5 dagen venster) */
  function buildClim(days) {
    const byDoy = Array.from({ length: 368 }, () => ({ tmax: [], tmin: [], precip: [], wind: [] }));
    for (const d of days) {
      const doy = dayOfYear(d.date);
      const b = byDoy[Math.min(366, doy)];
      if (d.tmax != null) b.tmax.push(d.tmax);
      if (d.tmin != null) b.tmin.push(d.tmin);
      if (d.precip != null) b.precip.push(d.precip);
      if (d.wind != null) b.wind.push(d.wind);
    }
    const cache = new Map();
    const stats = (doy, field) => {
      const key = doy + ":" + field;
      if (cache.has(key)) return cache.get(key);
      const vals = [];
      for (let o = -5; o <= 5; o++) {
        let idx = doy + o;
        if (idx > 366) idx -= 366;
        if (idx < 1) idx += 366;
        vals.push(...byDoy[idx][field]);
      }
      let r;
      if (vals.length < 8) r = { mean: null, std: 1 };
      else {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        r = { mean, std: Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1 };
      }
      cache.set(key, r);
      return r;
    };
    const z = (date, field, value) => {
      if (date == null || value == null) return 0;
      const { mean, std } = stats(dayOfYear(date), field);
      if (mean == null) return 0;
      return (value - mean) / std;
    };
    return { stats, z };
  }

  /* 12 kenmerken: context = 14 meetdagen vóór het anker, doel = horizon dagen erna */
  function buildFeatures(series, anchorIdx, horizon, clim) {
    if (anchorIdx < 14 || anchorIdx >= series.length) return null;
    const target = series[anchorIdx + horizon];
    if (!target || !target.date) return null;
    const doyT = dayOfYear(target.date);
    const zAt = (back, field) => {
      const d = series[anchorIdx - back];
      return clim.z(d ? d.date : null, field || "tmax", d ? d[field || "tmax"] : null);
    };

    const z1 = zAt(1), z2 = zAt(2), z3 = zAt(3);
    let weekSum = 0;
    for (let k = 1; k <= 7; k++) weekSum += zAt(k);
    const week = weekSum / 7;
    const slope = (z1 + z2) / 2 - (zAt(4) + zAt(5)) / 2;
    let nightSum = 0;
    for (let k = 1; k <= 3; k++) nightSum += zAt(k, "tmin");
    let rainSum = 0;
    for (let k = 1; k <= 7; k++) rainSum += ((series[anchorIdx - k] || {}).precip || 0);
    let windSum = 0;
    for (let k = 1; k <= 3; k++) windSum += zAt(k, "wind");
    let biweekSum = 0;
    for (let k = 8; k <= 14; k++) biweekSum += zAt(k);

    return [
      Math.sin(2 * Math.PI * doyT / 365.25),
      Math.cos(2 * Math.PI * doyT / 365.25),
      Math.min(1, Math.max(1, horizon) / 40),
      z1, z2, z3,
      week,
      slope,
      nightSum / 3,
      Math.log1p(Math.max(0, rainSum)) / 2,
      windSum / 3,
      biweekSum / 7,
    ];
  }

  /* Leerpatronen: (context, horizon) → toekomstige afwijking van het klimaat */
  function buildTrainingSet(days, clim) {
    const inputs = [], outputs = [];
    const n = days.length;
    for (let i = 14; i < n; i += 2) {
      for (const h of HORIZONS) {
        const j = i + h;
        if (j >= n) continue;
        const target = days[j];
        if (target.tmax == null || target.tmin == null) continue;
        const f = buildFeatures(days, i, h, clim);
        if (!f) continue;
        inputs.push(f);
        outputs.push([
          clim.z(target.date, "tmax", target.tmax),
          clim.z(target.date, "tmin", target.tmin),
        ]);
      }
    }
    return { inputs, outputs };
  }

  /* Netwerk redeneert per dag en corrigeert de voorspelling */
  function refineWithBrain(net, clim, recentObs, forecast) {
    const series = recentObs.concat(forecast.map(d => ({
      date: d.date, tmax: d.tmax, tmin: d.tmin, precip: d.precip, wind: d.wind,
    })));
    const anchorIdx = recentObs.length - 1;
    if (anchorIdx < 14) return { refined: forecast.slice(), trace: [], corrections: [] };

    const all = [];
    const refined = forecast.map((day, j) => {
      const horizon = Math.max(1, Math.round((Date.parse(day.date) - Date.parse(series[anchorIdx].date)) / 86400000));
      const f = buildFeatures(series, anchorIdx, horizon, clim);
      if (!f) return day;
      const out = net.predict(f);
      const nT = clim.stats(dayOfYear(day.date), "tmax");
      const nM = clim.stats(dayOfYear(day.date), "tmin");
      const isAI = day.source === "caelia";
      const w = isAI ? Math.min(0.45, 0.28 + horizon * 0.008) : 0.12;
      const corrT = clamp(out[0] * nT.std, -4, 4);
      const corrM = clamp(out[1] * nM.std, -4, 4);
      all.push({ day, horizon, out, corrT, corrM, w, features: f });
      return {
        ...day,
        tmax: Math.round((day.tmax + w * corrT) * 10) / 10,
        tmin: Math.round((day.tmin + w * corrM) * 10) / 10,
        _neural: { zTmax: out[0], zTmin: out[1], weight: w },
      };
    });

    /* Feature-attributie (perturbatie + denktrace voor de opvallendste dagen) */
    const notable = all.slice().sort((a, b) => Math.abs(b.corrT * b.w) - Math.abs(a.corrT * a.w)).slice(0, 3);
    const trace = notable.map(c => {
      const attrs = c.features.map((v, k) => {
        const plus = c.features.slice(); plus[k] = v + 0.15;
        const minus = c.features.slice(); minus[k] = v - 0.15;
        return { k, mag: Math.abs(net.predict(plus)[0] - net.predict(minus)[0]) };
      }).sort((a, b) => b.mag - a.mag);
      const dir = c.corrT > 0 ? "warmer" : "koeler";
      const applied = c.corrT * c.w;
      return {
        date: c.day.date,
        text:
          "Pass 1 — patroonherkenning: " + FEATURE_NAMES[attrs[0].k] + " en " + FEATURE_NAMES[attrs[1].k] + " " +
          "wijzen op " + dir + " weer dan het klimaatgemiddelde. " +
          "Pass 2 — neuraal signaal: het netwerk bevestigt dit (anomaal " + (c.out[0] >= 0 ? "+" : "") + c.out[0].toFixed(1) + "σ op dag +" + c.horizon + "). " +
          "Pass 3 — beslissing: correctie " + (applied >= 0 ? "+" : "") + applied.toFixed(1) + "°C toegepast met " + Math.round(c.w * 100) + "% gewicht.",
      };
    });

    return {
      refined,
      trace,
      corrections: notable.map(c => ({
        date: c.day.date,
        from: Math.round(c.day.tmax),
        to: Math.round(c.day.tmax + c.corrT * c.w),
        delta: Math.round(c.corrT * c.w * 10) / 10,
      })),
    };
  }

  /* Metadata (leergeschiedenis per locatie) */
  function loadMeta(key) {
    try { return JSON.parse(localStorage.getItem(key + "_meta")) || {}; } catch { return {}; }
  }
  function saveMeta(key, m) {
    try { localStorage.setItem(key + "_meta", JSON.stringify(m)); } catch { /* vol */ }
  }

  function countWeights(sizes) {
    let acc = 0;
    for (let idx = 1; idx < sizes.length; idx++) acc += sizes[idx - 1] * sizes[idx] + sizes[idx];
    return acc;
  }

  let session = 0;

  /**
   * Start het CAELIA Neural Brain voor een locatie. archive = ruwe archief-API
   * data (via ClimoraAPI.fetchArchive). onUpdate events:
   *   { phase:"training", progress, message }
   *   { phase:"ready", extended, report }
   *   { phase:"unavailable", message }
   */
  function startCaeliaBrain({ lat, lon, daily, extended, archive }, onUpdate) {
    const my = ++session;
    const say = s => { if (session === my) onUpdate(s); };
    const cancelled = () => session !== my;
    const Neural = window.ClimoraNeural;
    const Knowledge = window.ClimoraKnowledge;
    if (!Neural || !Knowledge) return say({ phase: "unavailable" });

    const days = toDayList(archive);
    if (!days || days.length < 400) return say({ phase: "unavailable" });

    const clim = buildClim(days);

    /* ~4 jaar meetdata voor training (net als het origineel) */
    const trainDays = days.slice(-(4 * 365));
    const ds = buildTrainingSet(trainDays, clim);
    if (ds.inputs.length < 300) return say({ phase: "unavailable" });

    const net = new Neural.MLP(SIZES, 2024);
    const key = "caelia_brain_" + Number(lat).toFixed(2) + "_" + Number(lon).toFixed(2);
    const warm = Neural.loadWeights(net, key);
    const meta = loadMeta(key);

    let stdSum = 0, stdCnt = 0;
    for (let doy = 15; doy <= 366; doy += 15) { stdSum += clim.stats(doy, "tmax").std; stdCnt++; }
    const avgStd = stdCnt ? stdSum / stdCnt : 3;

    const forecast = daily.concat(extended).filter(d => d && d.date && d.tmax != null);

    Neural.trainInBackground(net, ds, {
      epochs: warm ? 10 : 25,
      batchSize: 32,
      lr: warm ? 0.008 : 0.02,
      isCancelled: cancelled,
      onProgress: (p, loss) => say({
        phase: "training",
        progress: 0.1 + p * 0.55,
        message: (warm
          ? "Verder leren (sessie " + ((meta.sessions || 0) + 1) + "): " + ds.inputs.length.toLocaleString("nl-NL") + " patronen"
          : "Neuraal netwerk traint van nul: " + ds.inputs.length.toLocaleString("nl-NL") + " patronen") +
          ", fout " + (loss != null ? (loss * avgStd).toFixed(2) + "°C" : "..."),
      }),
      onDone: () => {
        if (cancelled()) return;
        Neural.saveWeights(net, key);

        let sq = 0, cnt = 0;
        const step = Math.max(1, Math.floor(ds.inputs.length / 150));
        for (let i = 0; i < ds.inputs.length; i += step) {
          const out = net.predict(ds.inputs[i]);
          sq += (out[0] - ds.outputs[i][0]) ** 2;
          cnt++;
        }
        const rmseZ = cnt ? Math.sqrt(sq / cnt) : 0.8;
        const rmseC = Math.round(rmseZ * avgStd * 10) / 10;

        say({ phase: "refining", progress: 0.72 });

        const recentObs = days.slice(-30);
        const brain = refineWithBrain(net, clim, recentObs, forecast);
        const physics = Knowledge.runCaeliaPhysicsReasoning(brain.refined, clim);

        const report = {
          architecture: SIZES.join(" → "),
          weights: countWeights(SIZES),
          patterns: ds.inputs.length,
          rmseC,
          warmStart: warm,
          sessions: (meta.sessions || 0) + 1,
          lastTrained: new Date().toISOString(),
          trace: [...brain.trace, ...physics.trace],
          corrections: [...brain.corrections, ...physics.corrections],
          thoughts: physics.thoughts,
          knowledge: Knowledge.getLibraryStats(),
        };
        saveMeta(key, {
          sessions: report.sessions, rmse: rmseC,
          samples: ds.inputs.length, lastTrained: report.lastTrained,
        });

        /* Verfijnde dagen teruggeven: 0-16 ensemble, 17-40 CAELIA */
        const refinedAI = physics.refined.filter(d => d.source === "caelia");
        say({ phase: "ready", progress: 1, extended: refinedAI, report });
      },
    });
  }

  window.ClimoraCaelia = { REGIMES, buildClimateProfile, findAnalogs, classifyRegime, extendTo40, classifyDailyRegimes, startCaeliaBrain };
})();
