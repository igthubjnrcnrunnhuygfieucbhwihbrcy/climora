/* ClimoraWeather — Live regenradar: Leaflet + RainViewer-tegels. */
(function () {
  "use strict";

  let map = null;
  let radarLayer = null;
  let frames = [];
  let frameIdx = 0;
  let timer = null;

  function iconSvg(code, day) {
    return window.ClimoraIcons ? window.ClimoraIcons.svg(code, day) : "";
  }

  async function init(lat, lon) {
    const el = document.getElementById("radar-map");
    if (!el) return;
    if (map) { map.remove(); map = null; }
    map = L.map(el, { zoomControl: true, attributionControl: false }).setView([lat, lon], 7);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      className: "osm-tiles",
    }).addTo(map);

    L.circleMarker([lat, lon], { radius: 6, color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.9 }).addTo(map);

    try {
      const data = await window.ClimoraAPI.fetchRadarFrames();
      frames = data.frames || [];
      if (!frames.length) return;
      frameIdx = Math.max(0, frames.findIndex(f => f.time >= Date.now() / 1000 - 600));
      if (frameIdx < 0) frameIdx = frames.length - 1;
      showFrame(data, frameIdx);

      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (!frames.length) return;
        frameIdx = (frameIdx + 1) % frames.length;
        showFrame(data, frameIdx);
      }, 1800);
    } catch {
      /* radar niet beschikbaar — kaart blijft werken */
    }
  }

  function showFrame(data, idx) {
    const f = frames[idx];
    if (!f || !map) return;
    const url = `${data.host}${data.path}/radar/${f.path}/256/{z}/{x}/{y}/4/1_1.png`;
    if (radarLayer) map.removeLayer(radarLayer);
    radarLayer = L.tileLayer(url, { opacity: 0.7, maxZoom: 12 }).addTo(map);
    const el = document.getElementById("radar-time");
    if (el) {
      const t = new Date(f.time * 1000);
      el.textContent = (f.time > Date.now() / 1000 ? "Nowcast: " : "Radar: ") +
        t.toLocaleTimeString(window.ClimoraI18N.locale(), { hour: "2-digit", minute: "2-digit" });
    }
  }

  window.ClimoraRadar = { init, iconSvg };
})();
