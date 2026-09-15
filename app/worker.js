import { Brain, dequantizeWeights, N_KC, N_MBON } from '../trainer/brain-ref.js';

const ONLINE_LR = 0.0015;
const TRACE_DECAY = 0.65;

let brain = null;
let baseW = null;
let meta = null;
let traces = [];
let ready = false;

async function gunzip(buf) {
  if (typeof DecompressionStream === 'function') {
    const ds = new Response(buf).body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  }
  throw new Error('DecompressionStream required');
}

async function cached(version, url) {
  const key = 'bluffly-' + version + '-' + url;
  try {
    const cache = await caches.open('bluffly');
    const hit = await cache.match(key);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    await cache.put(key, new Response(buf));
    return new Uint8Array(buf);
  } catch {
    const res = await fetch(url);
    return new Uint8Array(await res.arrayBuffer());
  }
}

async function init(urls) {
  const t0 = performance.now();
  const metaUrl = urls.metaUrl || '../weights/meta.json';
  const weightUrl = urls.weightUrl || '../weights/kc2mbon.i8.gz';
  const metaBuf = await cached('meta', metaUrl);
  meta = JSON.parse(new TextDecoder().decode(metaBuf));
  const gz = await cached(meta.version, weightUrl);
  const raw = await gunzip(gz.buffer);
  const i8 = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (i8.length !== N_KC * N_MBON) throw new Error('weight length ' + i8.length);
  const w = dequantizeWeights(i8, meta.scales);
  brain = new Brain({
    w,
    theta: meta.kc_threshold,
    thetaStreet: meta.kc_threshold_by_street,
    seed: meta.projection_seed,
    riverMinCall: meta.river_min_call ?? 5,
    riverBigCall: !!meta.river_big_call,
  });
  baseW = w.slice();
  ready = true;
  return { ms: performance.now() - t0, version: meta.version };
}

function decide(view) {
  const t0 = performance.now();
  const action = brain.act(view);
  const trace = brain.snapshotTrace(action);
  traces.push({ trace, weight: 1 });
  for (let i = 0; i < traces.length - 1; i++) traces[i].weight *= TRACE_DECAY;
  return {
    action,
    means: Array.from(brain.means),
    mbon: Array.from(brain.mbon),
    nFired: brain.nFired,
    sparsity: brain.sparsity(),
    ms: performance.now() - t0,
    fired: Array.from(trace.fired),
  };
}

function outcome(chips) {
  const lr = ONLINE_LR;
  for (const t of traces) brain.applyTrace(t.trace, chips * t.weight, lr);
  traces = [];
  const max = 8;
  let peak = 0;
  for (let i = 0; i < brain.w.length; i++) {
    const d = Math.abs(brain.w[i] - baseW[i]);
    if (d > peak) peak = d;
    const lo = Math.max(0, baseW[i] - max);
    const hi = Math.min(brain.wMax, baseW[i] + max);
    if (brain.w[i] < lo) brain.w[i] = lo;
    if (brain.w[i] > hi) brain.w[i] = hi;
  }
  return { peak, sat: brain.saturation() };
}

function reset() {
  if (baseW) brain.w.set(baseW);
  traces = [];
}

function exportDelta() {
  const n = brain.w.length;
  const delta = new Float32Array(n);
  for (let i = 0; i < n; i++) delta[i] = brain.w[i] - baseW[i];
  return delta;
}

function importDelta(delta) {
  if (!delta || delta.length !== brain.w.length) return;
  for (let i = 0; i < brain.w.length; i++) {
    let v = baseW[i] + delta[i];
    if (v < 0) v = 0;
    if (v > brain.wMax) v = brain.wMax;
    brain.w[i] = v;
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      const info = await init(msg);
      self.postMessage({ type: 'ready', ...info, meta });
    } else if (msg.type === 'decide') {
      if (!ready) throw new Error('brain not ready');
      const r = decide(msg.view);
      self.postMessage({ type: 'decision', requestId: msg.requestId, ...r });
    } else if (msg.type === 'outcome') {
      const r = outcome(msg.chips);
      self.postMessage({ type: 'outcome-done', ...r });
    } else if (msg.type === 'reset') {
      reset();
      self.postMessage({ type: 'reset-done' });
    } else if (msg.type === 'export-delta') {
      const delta = exportDelta();
      self.postMessage({ type: 'delta', delta }, [delta.buffer]);
    } else if (msg.type === 'import-delta') {
      importDelta(msg.delta);
      self.postMessage({ type: 'import-done' });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
