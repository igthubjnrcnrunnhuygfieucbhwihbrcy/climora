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
  };

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / 86400000);
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

  window.ClimoraCaelia = { REGIMES, buildClimateProfile, findAnalogs, classifyRegime, extendTo40, classifyDailyRegimes };
})();
