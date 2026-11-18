/* ClimoraWeather — CAELIA v9.1 Knowledge (port van caeliaKnowledge.js).
   Fysische redeneerpass (pass 4): elke voorspellingsdag wordt gecheckt tegen
   meteorologische kennis met cijfers. Sub-tak-gedachten groeien tussen
   sessies door in localStorage (caelia_thoughts_v1). */
(function () {
  "use strict";

  const THOUGHTS_KEY = "caelia_thoughts_v1";
  const round1 = v => Math.round(v * 10) / 10;

  function loadThoughts() {
    try { return JSON.parse(localStorage.getItem(THOUGHTS_KEY) || "[]"); } catch { return []; }
  }

  function addThought(list, thought) {
    list.unshift({ ...thought, at: new Date().toISOString() });
    try { localStorage.setItem(THOUGHTS_KEY, JSON.stringify(list.slice(0, 40))); } catch { /* vol */ }
  }

  function dayOfYear(dateStr) {
    const d = new Date(dateStr + "T00:00:00Z");
    return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  }

  /* — Kennisbibliotheek (cijfermatige meteorologie) — */
  const LIBRARY = {
    gemiddelde_luchtdruk: 1013.25,
    dagtraject_helder: 13,
    dagtraject_bewolkt: 6,
    bewolking_demping: 0.3,
    lapse_rate_droog: 9.8,
    lapse_rate_vochtig: 4.9,
    bronnen: ["KNMI Leerboek Meteorologie", "Wikipedia: thermodynamica", "Wikipedia: bewolking", "Wikipedia: fronten"],
  };

  /**
   * Pass 4: checkt elke dag. Verwacht day { date, tmax, tmin, precipProb,
   * precip, code } en clim { stats(doy, field) }.
   * Geeft { refined, trace, corrections, thoughts }.
   */
  function runCaeliaPhysicsReasoning(forecast, clim) {
    const list = loadThoughts();
    const trace = [];
    const corrections = [];

    const refined = forecast.map(day => {
      let tmax = day.tmax, tmin = day.tmin;
      let prob = day.precipProb;
      const precip = day.precip || 0;
      const code = day.code != null ? day.code : 3;
      const out = { ...day };
      let changed = false;

      const doy = dayOfYear(day.date);
      const stat = f => { try { return (clim && clim.stats && clim.stats(doy, f)) || {}; } catch { return {}; } };
      const normT = stat("tmax"), normM = stat("tmin");
      const expectedRange = Math.max(4, ((normT.mean != null ? normT.mean : 0) - (normM.mean != null ? normM.mean : 0)) || 10);

      /* 1) Thermodynamica: tmin boven tmax is fysisch onmogelijk */
      if (tmax != null && tmin != null && tmin > tmax) {
        const from = tmax;
        const tmp = tmax; tmax = tmin; tmin = tmp;
        corrections.push({ date: day.date, from: Math.round(from), to: Math.round(tmax), delta: round1(tmax - from) });
        trace.push({
          date: day.date,
          text: "Pass 4 — kennis (thermodynamica): tmin " + round1(from) + "° lag boven tmax " + round1(tmax) + "° — fysisch onmogelijk, gedraaid naar " + Math.round(tmax) + "°/" + Math.round(tmin) + "°.",
        });
        addThought(list, {
          datum: day.date, tak: "thermodynamica", sub_tak: "temperatuur-orde",
          waarneming: "tmin " + round1(from) + "° > tmax " + round1(tmax) + "°",
          hypothese: "volgorde geschonden — omgewisseld rond het daggemiddelde", correctie: round1(tmax - from),
        });
        changed = true;
      }

      /* 2) Stralingsbalans: bewolkte dag met te groot dagtraject — wolken dempen */
      const cloudy = code >= 3 || precip > 0.5;
      const range = (tmax != null && tmin != null) ? tmax - tmin : 0;
      if (cloudy && range > expectedRange * 1.5 && range > 8 && tmax != null && tmin != null) {
        const corr = round1(Math.min(3, LIBRARY.bewolking_demping * (range - expectedRange * 1.15)));
        if (corr >= 0.3) {
          const from = tmax;
          tmax = round1(tmax - corr); tmin = round1(tmin + corr * 0.5);
          corrections.push({ date: day.date, from: Math.round(from), to: Math.round(tmax), delta: -corr });
          trace.push({
            date: day.date,
            text: "Pass 4 — kennis (stralingsbalans): dagtraject " + round1(range) + "° bij bewolking, norm " + round1(expectedRange) + "° — wolken dempen het verschil (~" + LIBRARY.dagtraject_helder + "° helder vs ~" + LIBRARY.dagtraject_bewolkt + "° dicht bewolkt), tmax " + corr + "° bijgesteld.",
          });
          addThought(list, {
            datum: day.date, tak: "bewolking", sub_tak: "stralingsbalans",
            waarneming: "dagtraject " + round1(range) + "° vs klimaatnorm " + round1(expectedRange) + "° bij bewolking",
            hypothese: "wolken dempen stralingsverschil (~" + LIBRARY.dagtraject_helder + "° helder vs ~" + LIBRARY.dagtraject_bewolkt + "° dicht bewolkt)", correctie: -corr,
          });
          changed = true;
        }
      }

      /* 3) Frontenkennis: kans en bewolking/neerslag moeten consistent zijn */
      if (prob != null && prob > 65 && code <= 1 && !changed) {
        corrections.push({ date: day.date, from: prob, to: 45, delta: -Math.round(prob - 45) });
        trace.push({
          date: day.date,
          text: "Pass 4 — kennis (fronten/drukstelsels): neerslagkans " + prob + "% bij heldere lucht (code " + code + ") — zonder bewolking geen opheffing, kans bijgesteld naar 45%.",
        });
        addThought(list, {
          datum: day.date, tak: "fronten", sub_tak: "bewolking-neerslag-consistentie",
          waarneming: "neerslagkans " + prob + "% bij code " + code + " (nauwelijks bewolking)",
          hypothese: "neerslag vereist bewolking/opheffing — kans terug naar code-band", correctie: round1(prob - 45),
        });
        prob = 45; changed = true;
      }
      if (prob != null && prob < 20 && precip > 1) {
        trace.push({
          date: day.date,
          text: "Pass 4 — kennis (drukstelsels): " + precip + "mm neerslag bij kans " + prob + "% — stijgingsbeweging bewezen, kans verhoogd naar 55%.",
        });
        addThought(list, {
          datum: day.date, tak: "drukstelsels", sub_tak: "stijgingsbeweging",
          waarneming: precip + "mm neerslag bij kans " + prob + "%",
          hypothese: "gemeten neerslag bewijst stijgingsbeweging van lagedrukgebied", correctie: 35,
        });
        prob = 55; changed = true;
      }

      out.tmax = tmax; out.tmin = tmin;
      if (changed) out.precipProb = prob != null ? prob : out.precipProb;
      return out;
    });

    return { refined, trace, corrections, thoughts: list };
  }

  function getLibraryStats() {
    return { regels: 4, bronnen: LIBRARY.bronnen.length, gedachten: loadThoughts().length };
  }

  window.ClimoraKnowledge = { runCaeliaPhysicsReasoning, getLibraryStats, LIBRARY, loadThoughts };
})();
