/* ClimoraWeather — Live regenradar: Leaflet + RainViewer-tegels.
   Meerdere instanties mogelijk: init(lat, lon, elementId, zoom). */
(function () {
  "use strict";

  const instances = new Map(); /* elementId -> { map, radarLayer, timer } */

  async function init(lat, lon, elementId, zoom) {
    const el = document.getElementById(elementId || "radar-map");
    if (!el || typeof L === "undefined") return;

    destroy(elementId);

    const map = L.map(el, {
      zoomControl: elementId !== "radar-mini",
      attributionControl: false,
      dragging: elementId !== "radar-mini",
      scrollWheelZoom: false,
      doubleClickZoom: elementId !== "radar-mini",
    }).setView([lat, lon], zoom || 7);

    const inst = { map, radarLayer: null, timer: null };
    instances.set(elementId, inst);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      className: "osm-tiles",
    }).addTo(map);

    L.circleMarker([lat, lon], {
      radius: 6, color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.9,
    }).addTo(map);

    try {
      const data = await window.ClimoraAPI.fetchRadarFrames();
      const frames = (data.frames || []).filter(f => f.time >= Date.now() / 1000 - 3600);
      if (!frames.length || instances.get(elementId) !== inst) return;

      let idx = frames.findIndex(f => f.time >= Date.now() / 1000 - 600);
      if (idx < 0) idx = frames.length - 1;
      showFrame(inst, data, frames, idx, elementId);

      inst.timer = setInterval(() => {
        if (instances.get(elementId) !== inst) { clearInterval(inst.timer); return; }
        idx = (idx + 1) % frames.length;
        showFrame(inst, data, frames, idx, elementId);
      }, 1800);
    } catch {
      /* radar niet beschikbaar — kaart blijft werken */
    }
  }

  function showFrame(inst, data, frames, idx, elementId) {
    const f = frames[idx];
    if (!f || !inst.map) return;
    const url = `${data.host}${data.path}/radar/${f.path}/256/{z}/{x}/{y}/4/1_1.png`;
    if (inst.radarLayer) inst.map.removeLayer(inst.radarLayer);
    inst.radarLayer = L.tileLayer(url, { opacity: 0.7, maxZoom: 12 }).addTo(inst.map);
    if (elementId === "radar-map") {
      const el = document.getElementById("radar-time");
      if (el) {
        const t = new Date(f.time * 1000);
        el.textContent = (f.time > Date.now() / 1000 ? "Nowcast: " : "Radar: ") +
          t.toLocaleTimeString(window.ClimoraI18N.locale(), { hour: "2-digit", minute: "2-digit" });
      }
    }
  }

  function destroy(elementId) {
    const inst = instances.get(elementId);
    if (!inst) return;
    if (inst.timer) clearInterval(inst.timer);
    try { inst.map.remove(); } catch { /* al verwijderd */ }
    instances.delete(elementId);
  }

  window.ClimoraRadar = { init, destroy };
})();
