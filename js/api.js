/* ClimoraWeather — API-laag: alle bronnen zijn sleutelloos (gratis).
 * Bronnen: Open-Meteo (forecast/ensemble/archief/air-quality/geocoding),
 * MET Norway, BigDataCloud, geojs.io, RainViewer, MeteoAlarm (via CORS-proxy). */
(function () {
  "use strict";

  const TIMEOUT = 12000;

  async function jfetch(url, opts) {
    const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(TIMEOUT) }, opts || {}));
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
  }

  /* ── Geografie ─────────────────────────────────────── */
  async function geocodeSearch(query, count) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count || 6}&language=nl&format=json`;
    const data = await jfetch(url);
    return (data.results || []).map(r => ({
      name: r.name,
      country: r.country,
      countryCode: r.country_code,
      admin1: r.admin1 || "",
      lat: r.latitude,
      lon: r.longitude,
    }));
  }

  async function reverseGeocode(lat, lon) {
    try {
      const d = await jfetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=nl`);
      return { name: d.city || d.locality || d.principalSubdivision || "Onbekend", country: d.countryName || "", countryCode: d.countryCode || "" };
    } catch {
      return { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, country: "", countryCode: "" };
    }
  }

  async function ipLocate() {
    try {
      const d = await jfetch("https://get.geojs.io/v1/ip/geo.json");
      return { lat: parseFloat(d.latitude), lon: parseFloat(d.longitude), name: d.city || d.region || "IP-locatie", country: d.country || "", countryCode: d.country_code || "" };
    } catch {
      const d = await jfetch("https://ipapi.co/json/");
      return { lat: d.latitude, lon: d.longitude, name: d.city || "IP-locatie", country: d.country_name || "", countryCode: d.country_code || "" };
    }
  }

  function gpsLocate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("geolocation unavailable"));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        err => reject(err),
        { timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  /* ── Open-Meteo multi-model forecast (dag 1–16) ────── */
  const OM_MODELS = [
    { id: "ecmwf_ifs025", name: "ECMWF IFS", weight: 0.30 },
    { id: "icon_seamless", name: "DWD ICON", weight: 0.25 },
    { id: "gfs_seamless", name: "NOAA GFS", weight: 0.25 },
    { id: "metno_seamless", name: "MET Norway", weight: 0.20 },
  ];

  const DAILY_VARS = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,pressure_msl,sunrise,sunset";

  async function fetchOmModel(lat, lon, modelId) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=${DAILY_VARS}&timezone=auto&forecast_days=16&models=${modelId}`;
    const data = await jfetch(url);
    return data.daily ? { modelId, daily: data.daily, utcOffsetSeconds: data.utc_offset_seconds || 0 } : null;
  }

  /* ── MET Norway (onafhankelijke tweede bron) ───────── */
  async function fetchMetNo(lat, lon) {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    const data = await jfetch(url, { headers: { Accept: "application/json" } });
    const ts = data && data.properties && data.properties.timeseries;
    if (!ts) return null;

    const dayMap = {};
    for (const e of ts) {
      const date = e.time.slice(0, 10);
      (dayMap[date] = dayMap[date] || []).push(e);
    }
    const dates = Object.keys(dayMap).sort().slice(0, 16);
    const daily = { time: dates, temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_max: [], precipitation_sum: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_direction_10m_dominant: [], weather_code: [], pressure_msl: [] };

    for (const date of dates) {
      let tmax = -Infinity, tmin = Infinity, feelsMax = -Infinity, precip = 0, windMax = 0, pSum = 0, pN = 0, dirX = 0, dirY = 0, dirN = 0, code = 3, noonDist = 99;
      for (const e of dayMap[date]) {
        const det = (e.data && e.data.instant && e.data.instant.details) || {};
        const h = parseInt(e.time.slice(11, 13), 10);
        if (det.air_temperature != null) {
          tmax = Math.max(tmax, det.air_temperature);
          tmin = Math.min(tmin, det.air_temperature);
        }
        if (det.air_temperature_max != null) tmax = Math.max(tmax, det.air_temperature_max);
        if (det.wind_speed != null) windMax = Math.max(windMax, det.wind_speed);
        if (det.air_pressure_at_sea_level != null) { pSum += det.air_pressure_at_sea_level; pN++; }
        if (det.wind_from_direction != null) {
          const rad = det.wind_from_direction * Math.PI / 180;
          dirX += Math.cos(rad); dirY += Math.sin(rad); dirN++;
        }
        const n1h = e.data && e.data.next_1_hours;
        if (n1h) {
          if (n1h.details && n1h.details.precipitation_amount != null) precip += n1h.details.precipitation_amount;
          if (n1h.summary && n1h.summary.symbol_code) {
            const sc = n1h.summary.symbol_code;
            const dist = Math.abs(h - 13);
            if (dist < noonDist) {
              noonDist = dist;
              code = /thunder/.test(sc) ? 95 : /sleet/.test(sc) ? 66 : /snow/.test(sc) ? (/(heavy|showers)/.test(sc) ? 85 : 71) :
                /rain/.test(sc) ? (/(heavy)/.test(sc) ? 65 : /(light|drizzle)/.test(sc) ? 61 : 63) :
                /fog/.test(sc) ? 45 : /partly|day|night/.test(sc) ? 2 : 1;
            }
          }
        }
      }
      daily.temperature_2m_max.push(Math.round(tmax * 10) / 10);
      daily.temperature_2m_min.push(Math.round(tmin * 10) / 10);
      daily.apparent_temperature_max.push(Math.round(feelsMax * 10) / 10);
      daily.precipitation_sum.push(Math.round(precip * 10) / 10);
      daily.precipitation_probability_max.push(null);
      daily.wind_speed_10m_max.push(Math.round(windMax * 10) / 10);
      daily.wind_direction_10m_dominant.push(dirN ? Math.round(((Math.atan2(dirY, dirX) * 180 / Math.PI) + 360) % 360) : null);
      daily.weather_code.push(code);
      daily.pressure_msl.push(pN ? Math.round(pSum / pN) : null);
    }
    return { modelId: "metno_api", name: "MET Norway", daily };
  }

  /* ── 15-minuten-nowcast (voor RainNowcast) ─────────── */
  async function fetchMinutely15(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&minutely_15=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover` +
      `&timezone=auto&forecast_days=3`;
    const data = await jfetch(url);
    const m = data.minutely_15 || {};
    const out = [];
    const now = new Date();
    for (let i = 0; i < (m.time || []).length; i++) {
      const ts = new Date(m.time[i]).getTime();
      if (ts < now.getTime() - 900000) continue;
      const [h, min] = m.time[i].slice(11, 16).split(":").map(Number);
      out.push({
        date: m.time[i].slice(0, 10),
        timeLabel: m.time[i].slice(11, 16),
        minutes: h * 60 + min,
        temp: m.temperature_2m ? m.temperature_2m[i] : null,
        feelsLike: m.apparent_temperature ? m.apparent_temperature[i] : null,
        code: m.weather_code ? m.weather_code[i] : 3,
        precip: m.precipitation ? m.precipitation[i] : 0,
        precipProb: m.precipitation_probability ? m.precipitation_probability[i] : 0,
        wind: m.wind_speed_10m ? m.wind_speed_10m[i] : 0,
        gusts: m.wind_gusts_10m ? m.wind_gusts_10m[i] : null,
        humidity: m.relative_humidity_2m ? m.relative_humidity_2m[i] : null,
        cloud: m.cloud_cover ? m.cloud_cover[i] : null,
        windDir: null,
        visibility: null,
        pressure: null,
      });
      if (out.length >= 48) break;
    }
    return out;
  }

  /* ── Uurdata (48 uur) ──────────────────────────────── */
  async function fetchHourly(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure` +
      `&timezone=auto&forecast_days=3&models=best_match`;
    const data = await jfetch(url);
    const h = data.hourly || {};
    const now = Date.now();
    const out = [];
    for (let i = 0; i < (h.time || []).length; i++) {
      const ts = new Date(h.time[i]).getTime();
      if (ts < now - 3600000) continue;
      const [hh, mm] = h.time[i].slice(11, 16).split(":").map(Number);
      out.push({
        time: h.time[i],
        timeLabel: h.time[i].slice(11, 16),
        minutes: hh * 60 + mm,
        temp: h.temperature_2m[i],
        feelsLike: h.apparent_temperature ? h.apparent_temperature[i] : null,
        precipProb: h.precipitation_probability ? h.precipitation_probability[i] : null,
        precip: h.precipitation[i],
        code: h.weather_code[i],
        wind: h.wind_speed_10m[i],
        windDir: h.wind_direction_10m ? h.wind_direction_10m[i] : null,
        gusts: h.wind_gusts_10m ? h.wind_gusts_10m[i] : null,
        humidity: h.relative_humidity_2m ? h.relative_humidity_2m[i] : null,
        cloud: h.cloud_cover ? h.cloud_cover[i] : null,
        visibility: h.visibility ? h.visibility[i] : null,
        pressure: h.surface_pressure ? h.surface_pressure[i] : null,
      });
      if (out.length >= 48) break;
    }
    return out;
  }

  /* ── Luchtkwaliteit ────────────────────────────────── */
  async function fetchAirQuality(lat, lon) {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,uv_index,alder_pollen,birch_pollen,grass_pollen&timezone=auto`;
    const data = await jfetch(url);
    return data.current || null;
  }

  /* ── Archief (30 jaar) voor het klimaatprofiel ─────── */
  async function fetchArchive(lat, lon) {
    const end = new Date(Date.now() - 7 * 86400000);
    const start = new Date(end.getTime() - 30 * 365.25 * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    const data = await jfetch(url);
    return data.daily || null;
  }

  /* ── Actuele waarnemingen (verificatie AI Captain) ─── */
  async function fetchPastActuals(lat, lon, pastDays) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&past_days=${pastDays || 16}&forecast_days=1`;
    const data = await jfetch(url);
    return data.daily || null;
  }

  /* ── Waarschuwingen (MeteoAlarm via CORS-proxy) ────── */
  const METEOALARM_COUNTRIES = { NL: "netherlands", DE: "germany", BE: "belgium", FR: "france", GB: "united-kingdom", DK: "denmark", AT: "austria", CH: "switzerland", ES: "spain", IT: "italy", PT: "portugal", PL: "poland", LU: "luxembourg", IE: "ireland", NO: "norway", SE: "sweden", FI: "finland", EE: "estonia", LV: "latvia", LT: "lithuania", CZ: "czechia", SK: "slovakia", HU: "hungary", SI: "slovenia", HR: "croatia", RO: "romania", BG: "bulgaria", GR: "greece" };

  async function fetchWarnings(countryCode) {
    const slug = METEOALARM_COUNTRIES[countryCode];
    if (!slug) return [];
    const feedUrl = `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${slug}`;
    try {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) return [];
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      const entries = Array.from(xml.getElementsByTagName("entry")).slice(0, 8);
      const out = [];
      for (const e of entries) {
        const get = tag => {
          const el = e.getElementsByTagName(tag)[0];
          return el ? el.textContent.trim() : "";
        };
        const raw = (get("cap:severity") || get("severity") || "moderate").toLowerCase();
        const level = raw.includes("extreme") ? "rood" : raw.includes("severe") ? "oranje" : "geel";
        out.push({
          level,
          title: get("cap:event") || get("event") || get("title") || "Waarschuwing",
          area: get("cap:areaDesc") || get("areaDesc") || "",
          summary: get("cap:description") || get("description") || "",
          source: "MeteoAlarm",
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  /* ── RainViewer (radar) ────────────────────────────── */
  async function fetchRadarFrames() {
    const d = await jfetch("https://api.rainviewer.com/public/weather-maps.json");
    const past = (d.radar && d.radar.past) || [];
    const nowcast = (d.radar && d.radar.nowcast) || [];
    return { host: `${location.protocol}//${d.host}`, path: d.path || "", frames: past.concat(nowcast.slice(0, 1)) };
  }

  window.ClimoraAPI = {
    jfetch, geocodeSearch, reverseGeocode, ipLocate, gpsLocate,
    OM_MODELS, fetchOmModel, fetchMetNo, fetchHourly, fetchMinutely15, fetchAirQuality,
    fetchArchive, fetchPastActuals, fetchWarnings, fetchRadarFrames,
  };
})();
