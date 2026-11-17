/* ClimoraWeather — lichte canvas-grafieken (geen dependency). */
(function () {
  "use strict";

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement.clientWidth - 2 || 600;
    const height = parseInt(canvas.getAttribute("height"), 10) || 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  /* Temperatuurverloop met onzekerheidsband (P10–P90) */
  function drawTempChart(canvas, points, opts) {
    const o = opts || {};
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    if (!points || points.length < 2) return;

    const padL = 34, padR = 10, padT = 14, padB = 26;
    const iw = width - padL - padR, ih = height - padT - padB;

    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      for (const v of [p.tmin, p.tmax, p.p10, p.p90]) {
        if (v == null) continue;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
    }
    if (!isFinite(lo)) return;
    const pad = Math.max(1, (hi - lo) * 0.12);
    lo -= pad; hi += pad;

    const x = i => padL + (i / (points.length - 1)) * iw;
    const y = v => padT + (1 - (v - lo) / (hi - lo)) * ih;

    const light = !!o.light;
    const cGrid = light ? "#e2e8f0" : "rgba(143,163,191,0.15)";
    const cLabel = light ? "#64748b" : "#8fa3bf";
    const cBand = light ? "rgba(37,99,235,0.10)" : "rgba(14,165,233,0.14)";
    const cMax = light ? "#2563eb" : "#f97316";
    const cMin = light ? "#60a5fa" : "#38bdf8";

    /* gridlijnen */
    ctx.strokeStyle = cGrid;
    ctx.fillStyle = cLabel;
    ctx.font = "10px system-ui";
    ctx.lineWidth = 1;
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const v = lo + (hi - lo) * s / steps;
      const yy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(width - padR, yy); ctx.stroke();
      ctx.fillText(Math.round(v) + "°", 4, yy + 3);
    }

    /* band */
    const hasBand = points.some(p => p.p10 != null && p.p90 != null);
    if (hasBand) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < points.length; i++) {
        const v = points[i].p90 != null ? points[i].p90 : points[i].tmax;
        if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
      }
      for (let i = points.length - 1; i >= 0; i--) {
        const v = points[i].p10 != null ? points[i].p10 : points[i].tmin;
        ctx.lineTo(x(i), y(v));
      }
      ctx.closePath();
      ctx.fillStyle = cBand;
      ctx.fill();
    }

    /* lijnen */
    const line = (key, color) => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < points.length; i++) {
        const v = points[i][key];
        if (v == null) continue;
        if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    /* Neerslagstaven (24-uursweergave) */
    const hasPrecip = points.some(p => p.precip != null && p.precip > 0);
    if (hasPrecip) {
      const maxP = Math.max(...points.map(p => p.precip || 0));
      const barW = Math.max(2, iw / points.length - 2);
      for (let i = 0; i < points.length; i++) {
        const p = points[i].precip || 0;
        if (p <= 0) continue;
        const bh = Math.max(3, (p / maxP) * ih * 0.35);
        ctx.fillStyle = "rgba(96,165,250,0.45)";
        ctx.fillRect(x(i) - barW / 2, padT + ih - bh, barW, bh);
      }
    }

    /* Enkele reeks (24-uursweergave): vulling onder de lijn */
    const single = points.every(p => p.tmin == null);
    if (single) {
      ctx.beginPath();
      ctx.moveTo(x(0), y(points[0].tmax != null ? points[0].tmax : lo));
      for (let i = 1; i < points.length; i++) ctx.lineTo(x(i), y(points[i].tmax != null ? points[i].tmax : lo));
      ctx.lineTo(x(points.length - 1), padT + ih);
      ctx.lineTo(x(0), padT + ih);
      ctx.closePath();
      ctx.fillStyle = light ? "rgba(37,99,235,0.08)" : "rgba(249,115,22,0.10)";
      ctx.fill();
    }

    line("tmax", cMax);
    line("tmin", cMin);

    /* x-labels */
    ctx.fillStyle = cLabel;
    const step = Math.ceil(points.length / 8);
    for (let i = 0; i < points.length; i += step) {
      const lbl = points[i].label || "";
      ctx.fillText(lbl, x(i) - 10, height - 8);
    }
  }

  /* Uurlijke neerslagstaven + temperatuurlijn */
  function drawHourlyChart(canvas, hours, opts) {
    const o = opts || {};
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    if (!hours || hours.length < 2) return;

    const padL = 34, padR = 10, padT = 12, padB = 24;
    const iw = width - padL - padR, ih = height - padT - padB;

    const temps = hours.map(h => h.temp).filter(v => v != null);
    const maxPrecip = Math.max(1, ...hours.map(h => h.precip || 0));
    let lo = Math.min(...temps), hi = Math.max(...temps);
    const pad = Math.max(1, (hi - lo) * 0.15); lo -= pad; hi += pad;

    const x = i => padL + (i / (hours.length - 1)) * iw;
    const yT = v => padT + (1 - (v - lo) / (hi - lo)) * ih;

    /* neerslagstaven */
    const barW = Math.max(1.5, iw / hours.length - 1);
    for (let i = 0; i < hours.length; i++) {
      const p = hours[i].precip || 0;
      if (p <= 0) continue;
      const bh = (p / maxPrecip) * ih * 0.5;
      ctx.fillStyle = "rgba(96,165,250,0.55)";
      ctx.fillRect(x(i) - barW / 2, padT + ih - bh, barW, bh);
    }

    /* temp-lijn */
    ctx.beginPath();
    for (let i = 0; i < hours.length; i++) {
      if (hours[i].temp == null) continue;
      const px = x(i), py = yT(hours[i].temp);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = o.light ? "#2563eb" : "#f97316";
    ctx.lineWidth = 2;
    ctx.stroke();

    /* labels */
    ctx.fillStyle = o.light ? "#64748b" : "#8fa3bf";
    ctx.font = "10px system-ui";
    const step = Math.ceil(hours.length / 8);
    for (let i = 0; i < hours.length; i += step) {
      ctx.fillText(hours[i].label || "", x(i) - 12, height - 8);
    }
    ctx.fillText(Math.round(hi) + "°", 4, yT(hi) + 3);
    ctx.fillText(Math.round(lo) + "°", 4, yT(lo) + 3);
  }

  /* Zonboog: zonsopgang tot zonsondergang met huidige zonnestand */
  function drawSunArc(canvas, riseMin, setMin, nowMin) {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    if (riseMin == null || setMin == null || setMin <= riseMin) return;

    const padX = 18, padT = 16, padB = 22;
    const iw = width - padX * 2, ih = height - padT - padB;
    const baseY = padT + ih;

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, baseY); ctx.lineTo(width - padX, baseY); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.quadraticCurveTo(width / 2, padT - ih * 0.55, width - padX, baseY);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.stroke();

    const now = nowMin != null ? Math.min(Math.max(nowMin, riseMin), setMin) : riseMin;
    const t = (now - riseMin) / (setMin - riseMin);
    const px = padX + t * iw;
    const py = baseY - (1 - Math.pow(2 * t - 1, 2)) * ih;

    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.quadraticCurveTo(width / 2, padT - ih * 0.55, px, py);
    ctx.lineTo(px, baseY);
    ctx.closePath();
    ctx.fillStyle = "rgba(245,158,11,0.12)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "10px system-ui";
    ctx.fillText("0 uur", padX, height - 6);
    const lbl = Math.round((setMin - riseMin) / 60 * 10) / 10 + " uur";
    ctx.fillText(lbl, width / 2 - 14, height - 6);
    ctx.fillText("24 uur", width - padX - 28, height - 6);
  }

  window.ClimoraChart = { drawTempChart, drawHourlyChart, drawSunArc };
})();
