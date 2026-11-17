#!/usr/bin/env bash
# ClimoraWeather — lokale proeftest
# Controleert: JS-syntaxis, alle bestanden serveren met HTTP 200,
# en de AI-logica (AI Captain + CAELIA) draait zonder fouten.
# Gebruik:  bash check-local.sh
set -uo pipefail

cd "$(dirname "$0")"
FAIL=0

echo "── 1/3 JavaScript-syntaxis ──────────────────────────"
if command -v node >/dev/null 2>&1; then
  for f in js/*.js; do
    if node --check "$f" 2>/tmp/climora-check.err; then
      echo "  OK   $f"
    else
      echo "  FAIL $f"; cat /tmp/climora-check.err; FAIL=1
    fi
  done
else
  echo "  SKIP node niet gevonden — syntaxis niet gecontroleerd"
fi

echo "── 2/3 Bestanden via lokale server ──────────────────"
PORT=${CLIMORA_PORT:-8123}
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1

paths="index.html privacy.html voorwaarden.html css/style.css \
js/i18n.js js/icons.js js/api.js js/captain.js js/caelia.js \
js/chart.js js/radar.js js/main.js docs/DOMEIN.md"

python3 - "$PORT" $paths <<'PY' || FAIL=1
import sys, urllib.request
port, paths = sys.argv[1], sys.argv[2:]
fail = False
for p in paths:
    try:
        code = urllib.request.urlopen(f"http://127.0.0.1:{port}/{p}", timeout=5).status
    except Exception as e:
        print(f"  (fout: {type(e).__name__}: {e})")
        code = 0
    print(("  OK   " if code == 200 else "  FAIL ") + f"{code}  {p}")
    fail = fail or code != 200
sys.exit(1 if fail else 0)
PY

echo "── 3/3 AI-logica (Captain + CAELIA) ─────────────────"
if command -v node >/dev/null 2>&1; then
  if node -e '
    global.window = global;
    global.localStorage = { _s:{}, getItem(k){return this._s[k]??null}, setItem(k,v){this._s[k]=String(v)} };
    const fs = require("fs");
    eval(fs.readFileSync("js/captain.js","utf8"));
    eval(fs.readFileSync("js/caelia.js","utf8"));
    const arch = { time:[], temperature_2m_max:[], temperature_2m_min:[], precipitation_sum:[] };
    const start = Date.now() - 30*365*86400000;
    for (let i=0;i<30*365;i++) {
      const d = new Date(start + i*86400000);
      arch.time.push(d.toISOString().slice(0,10));
      arch.temperature_2m_max.push(14 + Math.sin(i/365*2*Math.PI)*10);
      arch.temperature_2m_min.push(6 + Math.sin(i/365*2*Math.PI)*8);
      arch.precipitation_sum.push(i%3===0 ? 2.5 : 0);
    }
    const profile = window.ClimoraCaelia.buildClimateProfile(arch);
    if (!profile || profile.length !== 366) throw new Error("klimaatprofiel onvolledig");
    const w16 = [];
    for (let i=1;i<=16;i++) {
      const d = new Date(Date.now()+i*86400000);
      w16.push({date:d.toISOString().slice(0,10), tmax:15, tmin:7, tmaxP10:13, tmaxP90:17,
                precip:1, precipProb:40, wind:5, windDir:230, code:2, pressure:1012});
    }
    const ext = window.ClimoraCaelia.extendTo40(w16, profile, arch, false);
    if (ext.days.length !== 24) throw new Error("CAELIA leverde geen 24 dagen");
    const w = window.ClimoraCaptain.computeWeights();
    if (Object.keys(w.weights).length < 4) throw new Error("gewichten onvolledig");
    console.log("  OK   klimaatprofiel 366 dagen, CAELIA 24 dagen, gewichten: " +
      Object.entries(w.weights).map(([k,v])=>k+" "+Math.round(v*100)+"%").join(", "));
  ' 2>&1; then
    :
  else
    FAIL=1
  fi
else
  echo "  SKIP node niet gevonden — AI-logica niet gecontroleerd"
fi

echo "─────────────────────────────────────────────────────"
if [ "$FAIL" = "0" ]; then
  echo "ALLE PROEFTESTEN GESLAAGD — open http://127.0.0.1:$PORT/ in je browser"
  echo "(de server draait nog; stoppen met: kill $SRV)"
  exit 0
else
  echo "ER ZIJN FOUTEN — zie hierboven"
  exit 1
fi
