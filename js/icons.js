/* ClimoraWeather — SVG-weericonen (LiveSkyIcon-stijl, geen dependency). */
(function () {
  "use strict";

  const C = {
    sun: "#f59e0b", sunCore: "#fbbf24",
    moon: "#cbd5e1",
    cloud: "#94a3b8", cloudDark: "#64748b",
    rain: "#38bdf8", snow: "#e0f2fe",
    bolt: "#facc15", fog: "#a8b3c4",
  };

  function sun(cx, cy, r) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.sunCore}"/>` +
      [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const rad = a * Math.PI / 180;
        const x1 = cx + Math.cos(rad) * (r + 3), y1 = cy + Math.sin(rad) * (r + 3);
        const x2 = cx + Math.cos(rad) * (r + 7), y2 = cy + Math.sin(rad) * (r + 7);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.sun}" stroke-width="2" stroke-linecap="round"/>`;
      }).join("");
  }

  function moon(cx, cy, r) {
    return `<path d="M ${cx + r * 0.4} ${cy - r} a ${r} ${r} 0 1 0 ${r * 0.6} ${r * 1.7} a ${r * 0.85} ${r * 0.85} 0 1 1 ${-r * 0.6} ${-r * 1.7}z" fill="${C.moon}"/>`;
  }

  function cloud(cx, cy, s, fill) {
    return `<g transform="translate(${cx} ${cy}) scale(${s})">` +
      `<path d="M -16 6 a 8 8 0 0 1 1.2 -15.9 A 10 10 0 0 1 4 -13.5 A 8.5 8.5 0 0 1 14 6 z" fill="${fill}"/></g>`;
  }

  function drops(cx, cy, n, color) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = cx - 8 + i * 8;
      out += `<line x1="${x}" y1="${cy}" x2="${x - 2}" y2="${cy + 7}" stroke="${color}" stroke-width="2.4" stroke-linecap="round"><animate attributeName="opacity" values="1;0.25;1" dur="1.1s" begin="${i * 0.18}s" repeatCount="indefinite"/></line>`;
    }
    return out;
  }

  function flakes(cx, cy, n) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = cx - 8 + i * 8;
      out += `<circle cx="${x}" cy="${cy + 4}" r="2" fill="${C.snow}"><animate attributeName="cy" values="${cy};${cy + 8};${cy}" dur="1.6s" begin="${i * 0.25}s" repeatCount="indefinite"/></circle>`;
    }
    return out;
  }

  /* WMO-code → icoon */
  function svg(code, isDay) {
    isDay = isDay !== false;
    const body = [];
    switch (true) {
      case code === 0:
        body.push(isDay ? sun(16, 15, 8) : moon(16, 15, 8)); break;
      case code === 1:
        body.push(isDay ? sun(12, 11, 7) : moon(12, 11, 7), cloud(21, 19, 1.0, C.cloud)); break;
      case code === 2:
        body.push(isDay ? sun(10, 9, 6) : moon(10, 9, 6), cloud(21, 18, 1.15, C.cloud)); break;
      case code === 3:
        body.push(cloud(16, 15, 1.35, C.cloudDark)); break;
      case code === 45 || code === 48:
        body.push(cloud(16, 14, 1.25, C.fog), `<line x1="6" y1="24" x2="26" y2="24" stroke="${C.fog}" stroke-width="2" stroke-linecap="round" opacity="0.7"/><line x1="9" y1="28" x2="23" y2="28" stroke="${C.fog}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>`); break;
      case code >= 51 && code <= 57:
        body.push(cloud(16, 12, 1.2, C.cloud), drops(16, 21, 3, C.rain)); break;
      case code >= 61 && code <= 67:
        body.push(cloud(16, 12, 1.25, C.cloudDark), drops(16, 21, 3, C.rain)); break;
      case code >= 71 && code <= 77:
        body.push(cloud(16, 12, 1.25, C.cloud), flakes(16, 21, 3)); break;
      case code >= 80 && code <= 82:
        body.push(sun(9, 8, 5), cloud(19, 15, 1.15, C.cloudDark), drops(19, 23, 2, C.rain)); break;
      case code === 85 || code === 86:
        body.push(cloud(16, 12, 1.25, C.cloud), flakes(16, 21, 3)); break;
      case code >= 95:
        body.push(cloud(16, 11, 1.25, C.cloudDark), `<path d="M 17 18 l -4 7 h 4 l -2 6 l 7 -9 h -4 l 3 -4 z" fill="${C.bolt}"/>`, drops(10, 21, 1, C.rain)); break;
      default:
        body.push(cloud(16, 15, 1.2, C.cloud));
    }
    return `<svg viewBox="0 0 32 34" xmlns="http://www.w3.org/2000/svg">${body.join("")}</svg>`;
  }

  window.ClimoraIcons = { svg };
})();
