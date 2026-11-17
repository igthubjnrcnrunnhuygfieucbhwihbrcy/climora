/* ClimoraWeather — AI Captain: leerlus in localStorage.
 * Pipeline: (1) voorspellingen per model opslaan, (2) verifiëren tegen
 * waarnemingen, (3) bias per model/variabele/lead-time meten,
 * (4) dynamische gewichten (70% geleerd + 30% standaard, anti-overfitting),
 * (5) inzichten in CaptainMemory. Volledig lokaal, geen server nodig. */
(function () {
  "use strict";

  const KEY_TRACK = "climora_modeltrack";
  const KEY_MEMORY = "climora_captainmemory";
  const MAX_AGE_DAYS = 120;

  const DEFAULT_WEIGHTS = { ecmwf_ifs025: 0.30, icon_seamless: 0.25, gfs_seamless: 0.25, metno_seamless: 0.20, metno_api: 0.20 };
  const MODEL_NAMES = { ecmwf_ifs025: "ECMWF IFS", icon_seamless: "DWD ICON", gfs_seamless: "NOAA GFS", metno_seamless: "MET Norway", metno_api: "MET Norway" };

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota vol: negeer */ }
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  /* ── 1. Voorspellingen vastleggen (ModelTrack) ─────── */
  function recordPredictions(locKey, models) {
    const track = load(KEY_TRACK, {});
    const today = todayStr();
    let stored = 0;
    for (const m of models) {
      if (!m || !m.daily) continue;
      const d = m.daily;
      for (let i = 0; i < (d.time || []).length; i++) {
        const date = d.time[i];
        if (date < today) continue;
        const lead = Math.round((new Date(date) - new Date(today)) / 86400000);
        const vars = { tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], precip: d.precipitation_sum[i] };
        for (const v of Object.keys(vars)) {
          const val = vars[v];
          if (val == null) continue;
          const id = `${locKey}|${date}|${m.modelId}|${v}`;
          if (!track[id]) { stored++; }
          track[id] = { locKey, date, model: m.modelId, v, value: val, lead, verified: false, ts: Date.now() };
        }
      }
    }
    pruneTrack(track);
    save(KEY_TRACK, track);
    return stored;
  }

  function pruneTrack(track) {
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
    for (const id of Object.keys(track)) {
      if (track[id].ts < cutoff) delete track[id];
    }
  }

  /* ── 2. Verifiëren tegen waarnemingen ──────────────── */
  async function verifyAndLearn(locKey, lat, lon) {
    const track = load(KEY_TRACK, {});
    const pending = {};
    for (const id of Object.keys(track)) {
      const e = track[id];
      if (e.locKey === locKey && !e.verified && e.date < todayStr()) pending[id] = e;
    }
    const dates = [...new Set(Object.values(pending).map(e => e.date))];
    if (!dates.length) return 0;

    let actuals = null;
    try {
      actuals = await window.ClimoraAPI.fetchPastActuals(lat, lon, 16);
    } catch { return 0; }
    if (!actuals || !actuals.time) return 0;

    const actual = {};
    for (let i = 0; i < actuals.time.length; i++) {
      actual[actuals.time[i]] = {
        tmax: actuals.temperature_2m_max[i],
        tmin: actuals.temperature_2m_min[i],
        precip: actuals.precipitation_sum[i],
      };
    }

    const memory = load(KEY_MEMORY, {});
    let verified = 0;
    for (const id of Object.keys(pending)) {
      const e = pending[id];
      const a = actual[e.date];
      if (!a || a[e.v] == null) continue;
      const err = e.value - a[e.v];
      e.verified = true;
      verified++;

      const bucket = e.lead <= 3 ? "1-3" : e.lead <= 7 ? "4-7" : "8-16";
      const memKey = `${e.model}|${e.v}|${bucket}`;
      const m = memory[memKey] || { n: 0, sumErr: 0, sumSq: 0 };
      m.n += 1; m.sumErr += err; m.sumSq += err * err;
      memory[memKey] = m;
    }
    save(KEY_TRACK, track);
    save(KEY_MEMORY, memory);
    return verified;
  }

  /* ── 3. Bias-correctie per model/variabele/lead-time ─ */
  function getBias(model, lead, v) {
    const memory = load(KEY_MEMORY, {});
    const bucket = lead <= 3 ? "1-3" : lead <= 7 ? "4-7" : "8-16";
    const m = memory[`${model}|${v}|${bucket}`];
    if (!m || m.n < 3) return 0;
    const meanErr = m.sumErr / m.n;
    const shrink = m.n / (m.n + 3);
    return meanErr * shrink;
  }

  function hasLearning() {
    const memory = load(KEY_MEMORY, {});
    return Object.keys(memory).some(k => memory[k].n >= 3);
  }

  /* ── 4. Dynamische gewichten (70/30-blend) ─────────── */
  function computeWeights() {
    const memory = load(KEY_MEMORY, {});
    const rmse = {};
    for (const model of Object.keys(DEFAULT_WEIGHTS)) {
      let sse = 0, n = 0;
      for (const k of Object.keys(memory)) {
        const [m, , ] = k.split("|");
        if (m !== model) continue;
        const mem = memory[k];
        const mse = mem.sumSq / mem.n - Math.pow(mem.sumErr / mem.n, 2);
        sse += Math.max(0, mse) * mem.n;
        n += mem.n;
      }
      if (n >= 5) rmse[model] = Math.sqrt(sse / n);
    }
    const models = Object.keys(rmse);
    if (!models.length) return { weights: Object.assign({}, DEFAULT_WEIGHTS), learned: false };

    const invSum = models.reduce((s, m) => s + 1 / Math.max(0.1, rmse[m]), 0);
    const learned = {};
    for (const m of models) learned[m] = (1 / Math.max(0.1, rmse[m])) / invSum;

    const weights = {};
    const allModels = new Set([...Object.keys(DEFAULT_WEIGHTS), ...models]);
    for (const m of allModels) {
      const def = DEFAULT_WEIGHTS[m] || 0.05;
      const le = learned[m] || 0;
      weights[m] = 0.7 * le + 0.3 * def;
    }
    const total = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
    for (const m of Object.keys(weights)) weights[m] = weights[m] / total;
    return { weights, learned: true };
  }

  /* ── 5. Inzichten (CaptainMemory) ──────────────────── */
  function getInsights() {
    const memory = load(KEY_MEMORY, {});
    const out = [];
    for (const k of Object.keys(memory)) {
      const m = memory[k];
      if (m.n < 3) continue;
      const [model, v, bucket] = k.split("|");
      const meanErr = m.sumErr / m.n;
      const rmse = Math.sqrt(Math.max(0, m.sumSq / m.n - meanErr * meanErr));
      if (Math.abs(meanErr) < 0.3) continue;
      out.push({
        type: "model_bias",
        model: MODEL_NAMES[model] || model,
        v, bucket, n: m.n, meanErr, rmse,
        text: `${MODEL_NAMES[model] || model}: ${v === "tmax" ? "max. temp." : v === "tmin" ? "min. temp." : "neerslag"} ${meanErr > 0 ? "+" : ""}${meanErr.toFixed(1)}${v === "precip" ? " mm" : "°"} bij ${bucket} dagen vooruit (n=${m.n})`,
      });
    }
    out.sort((a, b) => b.n - a.n);
    return out.slice(0, 8);
  }

  function getStats() {
    const memory = load(KEY_MEMORY, {});
    let n = 0;
    for (const k of Object.keys(memory)) n += memory[k].n;
    return { samples: n, models: Object.keys(memory).length };
  }

  window.ClimoraCaptain = {
    recordPredictions, verifyAndLearn, getBias, hasLearning,
    computeWeights, getInsights, getStats, MODEL_NAMES, DEFAULT_WEIGHTS,
  };
})();
