import { CALL, FOLD, mulberry32 } from '../app/poker.js';
import { encode, N_PN } from '../app/encode.js';

export const N_KC = 5177;
export const KC_FANIN = 7;
export const N_MBON = 96;
export const N_COMPARTMENTS = 4;
export const MBON_PER_COMP = 24;
export const PROJECTION_SEED = 20240601;
export const W_MAX = 80;
export const TIE_REL = 0.003;

export function buildProjection(seed = PROJECTION_SEED) {
  const rng = mulberry32(seed);
  const edges = new Uint16Array(N_KC * KC_FANIN);
  const syn = new Float32Array(N_KC * KC_FANIN);
  const used = new Uint8Array(N_PN);
  for (let k = 0; k < N_KC; k++) {
    used.fill(0);
    const base = k * KC_FANIN;
    for (let j = 0; j < KC_FANIN; j++) {
      let p;
      do {
        p = (rng() * N_PN) | 0;
      } while (used[p]);
      used[p] = 1;
      edges[base + j] = p;
      syn[base + j] = 0.4 + rng() * 1.2;
    }
  }
  return { edges, syn };
}

export function quantizeWeights(w) {
  const scales = new Float64Array(N_MBON);
  const i8 = new Int8Array(N_KC * N_MBON);
  for (let m = 0; m < N_MBON; m++) {
    let max = 0;
    for (let k = 0; k < N_KC; k++) {
      const v = w[k * N_MBON + m];
      if (v > max) max = v;
    }
    const scale = max > 0 ? max / 127 : 1;
    scales[m] = scale;
    for (let k = 0; k < N_KC; k++) {
      let q = Math.round(w[k * N_MBON + m] / scale);
      if (q > 127) q = 127;
      if (q < 0) q = 0;
      i8[k * N_MBON + m] = q;
    }
  }
  return { i8, scales };
}

export function dequantizeWeights(i8, scales, out) {
  const w = out || new Float32Array(N_KC * N_MBON);
  for (let m = 0; m < N_MBON; m++) {
    const scale = scales[m];
    for (let k = 0; k < N_KC; k++) {
      w[k * N_MBON + m] = i8[k * N_MBON + m] * scale;
    }
  }
  return w;
}

export class Brain {
  constructor(opts = {}) {
    const proj = opts.edges && opts.syn
      ? { edges: opts.edges, syn: opts.syn }
      : (opts.edges && opts.edges.edges)
        ? opts.edges
        : buildProjection(opts.seed ?? PROJECTION_SEED);
    this.edges = proj.edges;
    this.syn = proj.syn;
    this.w = opts.w || new Float32Array(N_KC * N_MBON);
    this.theta = opts.theta ?? 890;
    this.wMax = opts.wMax ?? W_MAX;
    this.pn = new Float32Array(N_PN);
    this.kc = new Uint8Array(N_KC);
    this.kcRate = new Float32Array(N_KC);
    this.fired = new Uint16Array(N_KC);
    this.nFired = 0;
    this.mbon = new Float32Array(N_MBON);
    this.means = new Float32Array(N_COMPARTMENTS);
    this.lastLegal = [true, true, true, true];
    this.lastToCall = 0;
    this.lastStreet = 1;
    this.tieRel = TIE_REL;
    if (!opts.w) this.initWeights(opts.initSeed ?? 1);
  }

  initWeights(seed) {
    const rng = mulberry32(seed);
    const w = this.w;
    for (let i = 0; i < w.length; i++) w[i] = 4 + (rng() - 0.5) * 0.04;
  }

  encodeView(view) {
    return encode(view, this.pn);
  }

  computeKC(pn = this.pn) {
    const edges = this.edges;
    const syn = this.syn;
    const kc = this.kc;
    const fired = this.fired;
    const theta = this.theta;
    let n = 0;
    for (let k = 0; k < N_KC; k++) {
      const b = k * 7;
      const sum = syn[b] * pn[edges[b]] + syn[b + 1] * pn[edges[b + 1]] +
        syn[b + 2] * pn[edges[b + 2]] + syn[b + 3] * pn[edges[b + 3]] +
        syn[b + 4] * pn[edges[b + 4]] + syn[b + 5] * pn[edges[b + 5]] +
        syn[b + 6] * pn[edges[b + 6]];
      if (sum >= theta) {
        kc[k] = 1;
        this.kcRate[k] = (sum - theta) / 120 + 0.2;
        fired[n++] = k;
      } else {
        kc[k] = 0;
        this.kcRate[k] = 0;
      }
    }
    this.nFired = n;
    return n / N_KC;
  }

  computeMBON() {
    const mbon = this.mbon;
    mbon.fill(0);
    const w = this.w;
    const fired = this.fired;
    const rate = this.kcRate;
    const n = this.nFired;
    for (let i = 0; i < n; i++) {
      const k = fired[i];
      const r = rate[k];
      const row = k * N_MBON;
      for (let m = 0; m < N_MBON; m++) mbon[m] += w[row + m] * r;
    }
    const means = this.means;
    for (let c = 0; c < 4; c++) {
      let s = 0;
      const base = c * MBON_PER_COMP;
      for (let u = 0; u < MBON_PER_COMP; u++) s += mbon[base + u];
      means[c] = s / MBON_PER_COMP;
    }
  }

  forward(view) {
    this.encodeView(view);
    const sp = this.computeKC(this.pn);
    this.computeMBON();
    this.lastLegal = view.legal;
    this.lastToCall = view.toCall;
    this.lastStreet = view.street;
    return {
      kcFire: this.kc,
      nFired: this.nFired,
      mbonDrive: this.mbon,
      compartmentMean: this.means,
      sparsity: sp,
    };
  }

  decide(legal = this.lastLegal, toCall = this.lastToCall, street = this.lastStreet) {
    const means = this.means;
    const masked = [means[0], means[1], means[2], means[3]];
    for (let c = 0; c < 4; c++) if (!legal[c]) masked[c] = Infinity;
    let min = Infinity, second = Infinity, arg = -1;
    for (let c = 0; c < 4; c++) {
      const v = masked[c];
      if (v < min) {
        second = min;
        min = v;
        arg = c;
      } else if (v < second) second = v;
    }
    if (arg < 0) {
      if (legal[CALL]) return CALL;
      if (legal[FOLD]) return FOLD;
      for (let c = 0; c < 4; c++) if (legal[c]) return c;
      return CALL;
    }
    const scale = Math.max(Math.abs(min), 1);
    if (!Number.isFinite(second) || (second - min) / scale < this.tieRel) {
      if (toCall === 0 && legal[CALL]) return CALL;
      if (legal[FOLD]) return FOLD;
      if (legal[CALL]) return CALL;
    }
    return arg;
  }

  act(view) {
    this.forward(view);
    return this.decide(view.legal, view.toCall, view.street);
  }

  learnOnError(wrongAction, correctAction, lr) {
    if (wrongAction === correctAction) return;
    const w = this.w;
    const wMax = this.wMax;
    const fired = this.fired;
    const n = this.nFired;
    const cBase = correctAction * MBON_PER_COMP;
    const wBase = wrongAction * MBON_PER_COMP;
    for (let i = 0; i < n; i++) {
      const k = fired[i];
      const step = lr * this.kcRate[k];
      const row = k * N_MBON;
      for (let u = 0; u < MBON_PER_COMP; u++) {
        const ci = row + cBase + u;
        const wi = row + wBase + u;
        let v = w[ci] - step;
        w[ci] = v < 0 ? 0 : v > wMax ? wMax : v;
        v = w[wi] + step;
        w[wi] = v < 0 ? 0 : v > wMax ? wMax : v;
      }
    }
  }

  sparsity() {
    return this.nFired / N_KC;
  }

  saturation() {
    const w = this.w;
    const wMax = this.wMax;
    let n = 0;
    for (let i = 0; i < w.length; i++) if (w[i] <= 0 || w[i] >= wMax) n++;
    return n / w.length;
  }

  exportState() {
    return {
      kcFire: this.kc.slice(),
      nFired: this.nFired,
      mbonDrive: this.mbon.slice(),
      compartmentMean: this.means.slice(),
      sparsity: this.sparsity(),
    };
  }
}

export function tuneThreshold(brain, views, target = 0.07) {
  let lo = 200, hi = 2800;
  for (let iter = 0; iter < 16; iter++) {
    const mid = (lo + hi) / 2;
    brain.theta = mid;
    let sp = 0;
    for (let i = 0; i < views.length; i++) {
      brain.encodeView(views[i]);
      sp += brain.computeKC(brain.pn);
    }
    sp /= views.length;
    if (sp > target) lo = mid;
    else hi = mid;
  }
  brain.theta = (lo + hi) / 2;
  let sp = 0;
  for (let i = 0; i < views.length; i++) {
    brain.encodeView(views[i]);
    sp += brain.computeKC(brain.pn);
  }
  return { theta: brain.theta, sparsity: sp / views.length };
}

export function matchStats(brain, items) {
  const recHit = [0, 0, 0, 0];
  const recTot = [0, 0, 0, 0];
  const dist = [0, 0, 0, 0];
  let hit = 0;
  let sp = 0;
  for (let i = 0; i < items.length; i++) {
    const view = items[i].view || items[i];
    const y = items[i].teacherAction;
    const a = brain.act(view);
    sp += brain.sparsity();
    dist[a]++;
    recTot[y]++;
    if (a === y) {
      hit++;
      recHit[y]++;
    }
  }
  const n = items.length || 1;
  return {
    match: hit / n,
    recall: recTot.map((t, i) => t ? recHit[i] / t : 0),
    recTot,
    dist: dist.map((d) => d / n),
    sparsity: sp / n,
  };
}
