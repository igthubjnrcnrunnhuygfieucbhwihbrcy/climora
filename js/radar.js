/* ClimoraWeather — Live regenradar: Leaflet + RainViewer-tegels.
   Meerdere instanties: init(lat, lon, elementId, zoom).
   Volledige kaart ("radar-map") krijgt automatisch play/pause + tijdschuif. */
(function () {
  "use strict";

  const instances = new Map(); /* elementId -> { map, radarLayer, timer, frames, data, idx, playing } */

  async function init(lat, lon, elementId, zoom) {
    const el = document.getElementById(elementId || "radar-map");
    if (!el || typeof L === "undefined") return;

    destroy(elementId);

    const mini = elementId === "radar-mini";
    const map = L.map(el, {
      zoomControl: !mini,
      attributionControl: false,
      dragging: !mini,
      scrollWheelZoom: false,
      doubleClickZoom: !mini,
    }).setView([lat, lon], zoom || 7);

    const inst = { map, radarLayer: null, timer: null, frames: [], data: null, idx: 0, playing: false };
    instances.set(elementId, inst);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      className: "osm-tiles",
    }).addTo(map);

    L.circleMarker([lat, lon], {
      radius: 6, color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.9,
    }).addTo(map);

    if (!mini) wireControls(elementId);

    try {
      const data = await window.ClimoraAPI.fetchRadarFrames();
      if (instances.get(elementId) !== inst) return;
      inst.data = data;
      inst.frames = (data.frames || []).filter(f => f.time >= Date.now() / 1000 - 3600);
      if (!inst.frames.length) return;

      let idx = inst.frames.findIndex(f => f.time >= Date.now() / 1000 - 600);
      if (idx < 0) idx = inst.frames.length - 1;
      inst.idx = idx;
      setupSlider(elementId);
      showFrame(inst, elementId);
      if (!mini) play(elementId, true);
    } catch {
      /* radar niet beschikbaar — kaart blijft werken */
    }
  }

  function wireControls(elementId) {
    const btn = document.getElementById("radar-play");
    const slider = document.getElementById("radar-slider");
    if (btn) {
      btn.onclick = () => {
        const inst = instances.get(elementId);
        if (!inst) return;
        play(elementId, !inst.playing);
      };
    }
    if (slider) {
      slider.oninput = () => {
        const inst = instances.get(elementId);
        if (!inst || !inst.frames.length) return;
        play(elementId, false);
        inst.idx = Math.round((Number(slider.value) / 100) * (inst.frames.length - 1));
        showFrame(inst, elementId);
      };
    }
  }

  function setupSlider(elementId) {
    const slider = document.getElementById("radar-slider");
    const inst = instances.get(elementId);
    if (slider && inst && inst.frames.length) {
      slider.max = String(inst.frames.length - 1);
      slider.value = String(inst.idx);
    }
  }

  function play(elementId, on) {
    const inst = instances.get(elementId);
    if (!inst) return;
    inst.playing = on;
    const btn = document.getElementById("radar-play");
    if (btn) btn.textContent = on ? "⏸" : "▶";
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    if (on) {
      inst.timer = setInterval(() => {
        if (instances.get(elementId) !== inst) { clearInterval(inst.timer); return; }
        if (!inst.frames.length) return;
        inst.idx = (inst.idx + 1) % inst.frames.length;
        const slider = document.getElementById("radar-slider");
        if (slider) slider.value = String(inst.idx);
        showFrame(inst, elementId);
      }, 1600);
    }
  }

  function showFrame(inst, elementId) {
    const f = inst.frames[inst.idx];
    if (!f || !inst.map || !inst.data) return;
    const url = `${inst.data.host}${inst.data.path}/radar/${f.path}/256/{z}/{x}/{y}/4/1_1.png`;
    if (inst.radarLayer) inst.map.removeLayer(inst.radarLayer);
    inst.radarLayer = L.tileLayer(url, { opacity: 0.75, maxZoom: 12 }).addTo(inst.map);
    const el = document.getElementById("radar-time");
    if (el) {
      const t = new Date(f.time * 1000);
      el.textContent = (f.time > Date.now() / 1000 ? "Nowcast: " : "Radar: ") +
        t.toLocaleTimeString(window.ClimoraI18N.locale(), { hour: "2-digit", minute: "2-digit" });
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
