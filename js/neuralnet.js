/* ClimoraWeather — CAELIA v9 neurale kernel (port van deviceAI/neuralNet.js).
   Echte machine learning: MLP met backpropagation + mini-batch SGD, volledig
   lokaal in de browser. Warm start via localStorage tussen sessies. */
(function () {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const relu = x => (x > 0 ? x : 0);

  class MLP {
    constructor(sizes, seed = 42) {
      this.sizes = sizes;
      const rng = mulberry32(seed);
      this.W = [];
      this.B = [];
      for (let l = 0; l < sizes.length - 1; l++) {
        const scale = Math.sqrt(2 / sizes[l]);
        this.W.push(Array.from({ length: sizes[l + 1] }, () =>
          Array.from({ length: sizes[l] }, () => (rng() * 2 - 1) * scale)));
        this.B.push(new Array(sizes[l + 1]).fill(0));
      }
    }

    forward(x) {
      const acts = [x];
      let a = x;
      for (let l = 0; l < this.W.length; l++) {
        const last = l === this.W.length - 1;
        const out = new Array(this.W[l].length);
        for (let i = 0; i < this.W[l].length; i++) {
          const row = this.W[l][i];
          let z = this.B[l][i];
          for (let j = 0; j < row.length; j++) z += row[j] * a[j];
          out[i] = last ? z : relu(z);
        }
        acts.push(out);
        a = out;
      }
      return acts;
    }

    predict(x) {
      return this.forward(x)[this.W.length];
    }

    /* Eén mini-batch SGD-stap (backprop, gemiddelde gradient). Geeft gem. loss. */
    trainBatch(batch, lr) {
      const L = this.W.length;
      const outDim = this.sizes[L];
      const gW = this.W.map(m => m.map(r => r.map(() => 0)));
      const gB = this.B.map(b => b.map(() => 0));
      let loss = 0;

      for (const { input, target } of batch) {
        const acts = this.forward(input);
        let delta = acts[L].map((o, k) => o - target[k]);
        for (const d of delta) loss += d * d;

        for (let l = L - 1; l >= 0; l--) {
          const aPrev = acts[l];
          for (let i = 0; i < this.W[l].length; i++) {
            const d = delta[i];
            if (d !== 0) {
              gB[l][i] += d;
              const gRow = gW[l][i], row = this.W[l][i];
              for (let j = 0; j < row.length; j++) gRow[j] += d * aPrev[j];
            }
          }
          if (l > 0) {
            const prev = new Array(this.sizes[l]).fill(0);
            for (let i = 0; i < delta.length; i++) {
              const d = delta[i];
              if (d === 0) continue;
              const row = this.W[l][i];
              for (let j = 0; j < row.length; j++) prev[j] += d * row[j];
            }
            for (let j = 0; j < prev.length; j++) prev[j] = acts[l][j] > 0 ? prev[j] : 0;
            delta = prev;
          }
        }
      }

      const n = batch.length;
      for (let l = 0; l < L; l++) {
        for (let i = 0; i < this.W[l].length; i++) {
          this.B[l][i] -= (lr * gB[l][i]) / n;
          const row = this.W[l][i], gRow = gW[l][i];
          for (let j = 0; j < row.length; j++) row[j] -= (lr * gRow[j]) / n;
        }
      }
      return loss / (n * outDim);
    }
  }

  /* Traineert in tijdsslices op de achtergrond (setTimeout) — UI blijft soepel. */
  function trainInBackground(net, dataset, opts, sliceMs = 12) {
    const o = opts || {};
    const n = dataset.inputs.length;
    if (n === 0) { if (o.onDone) o.onDone(null); return; }
    const bs = Math.min(o.batchSize || 16, n);
    let order = [...Array(n).keys()];
    let epoch = 0, cursor = 0, loss = null;

    const reshuffle = () => {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    };

    const step = () => {
      if (o.isCancelled && o.isCancelled()) return;
      const t0 = Date.now();
      while (Date.now() - t0 < sliceMs) {
        const batch = [];
        for (let b = 0; b < bs; b++) {
          batch.push({ input: dataset.inputs[order[cursor]], target: dataset.outputs[order[cursor]] });
          cursor++;
          if (cursor >= n) {
            cursor = 0;
            epoch++;
            reshuffle();
            if (epoch >= (o.epochs || 40)) {
              if (o.onProgress) o.onProgress(1, loss);
              if (o.onDone) o.onDone(loss);
              return;
            }
          }
        }
        loss = net.trainBatch(batch, o.lr || 0.05);
      }
      if (o.onProgress) o.onProgress(epoch / (o.epochs || 40), loss);
      setTimeout(step, 0);
    };
    reshuffle();
    step();
  }

  /* Serialisatie — warm start tussen sessies */
  function saveWeights(net, key) {
    try { localStorage.setItem(key, JSON.stringify({ W: net.W, B: net.B })); } catch { /* vol */ }
  }

  function loadWeights(net, key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      if (!raw || !raw.W || !raw.B || raw.W.length !== net.W.length) return false;
      net.W = raw.W;
      net.B = raw.B;
      return true;
    } catch { return false; }
  }

  window.ClimoraNeural = { MLP, trainInBackground, saveWeights, loadWeights, mulberry32 };
})();
