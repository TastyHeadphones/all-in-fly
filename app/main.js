import {
  ACTION_NAMES, ALL_IN, CALL, FOLD, RAISE, START_STACK,
  applyAction, assertChipConservation, createHand, eval5, mulberry32,
  viewFrom,
} from './poker.js';
import { renderTable, renderActions, setHandMsg } from './view-table.js';
import { renderBars, renderRaster, renderSparsity } from './view-brain.js';
import { renderRead } from './view-read.js';
import { mountFly, setFlyState } from './view-fly.js';
import {
  clearMemory, emptyStats, loadMemory, noteFlyAction, noteShowdown,
  noteVisitorAction, saveMemory,
} from './online.js';

const VISITOR = 0;
const FLY = 1;
const worker = new Worker('app/worker.js', { type: 'module' });

let state = null;
let busy = false;
let stats = emptyStats();
let foldRate = [0, 0];
let foldCount = [0, 0];
let handCount = [0, 0];
let pending = null;
let lastFlyAgg = false;

const tableEl = document.getElementById('table');
const barsEl = document.getElementById('bars');
const sparseEl = document.getElementById('sparsity');
const rasterEl = document.getElementById('raster');
const readEl = document.getElementById('read');
const flyEl = document.getElementById('fly');
const statusEl = document.getElementById('status');

mountFly(flyEl);

function post(msg, transfer) {
  worker.postMessage(msg, transfer || []);
}

worker.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'error') {
    console.error(msg.message);
    statusEl.textContent = msg.message;
    return;
  }
  if (msg.type === 'ready') {
    statusEl.textContent = 'Brain ready · ' + msg.ms.toFixed(0) + ' ms · ' + msg.version;
    loadMemory().then((rec) => {
      if (rec && rec.stats) stats = Object.assign(emptyStats(), rec.stats);
      if (rec && rec.delta) post({ type: 'import-delta', delta: rec.delta });
      renderRead(readEl, stats, resetMemory);
      newHand();
    }).catch(() => newHand());
    return;
  }
  if (msg.type === 'decision' && pending && msg.requestId === pending.id) {
    pending.resolve(msg);
    pending = null;
  }
  if (msg.type === 'reset-done') {
    statusEl.textContent = 'Fly memory cleared.';
  }
  if (msg.type === 'delta') {
    saveMemory({ stats, delta: msg.delta, savedAt: Date.now() }).catch((e) => console.error(e));
  }
};

worker.onerror = (e) => {
  console.error(e);
  statusEl.textContent = 'Worker failed to start.';
};

function askFly(view) {
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    pending = { id, resolve };
    post({ type: 'decide', view, requestId: id });
  });
}

function newHand() {
  state = createHand(mulberry32((Date.now() ^ Math.random() * 1e9) >>> 0));
  lastFlyAgg = false;
  setFlyState(flyEl, 'idle');
  setHandMsg('');
  paint();
  continueHand();
}

function paint() {
  renderTable(tableEl, state);
  renderRead(readEl, stats, resetMemory);
  const view = viewFrom(state, VISITOR, foldRate[FLY]);
  const acts = document.getElementById('actions');
  const ourTurn = !state.done && state.toAct === VISITOR && !busy;
  renderActions(acts, view, onVisitor, !ourTurn, state.done);
}

function onVisitor(action) {
  if (busy || state.done || state.toAct !== VISITOR) return;
  const view = viewFrom(state, VISITOR, foldRate[FLY]);
  if (!view.legal[action]) return;
  noteVisitorAction(stats, view.street, action, lastFlyAgg);
  applyAction(state, action);
  assertChipConservation(state);
  paint();
  continueHand();
}

async function continueHand() {
  if (state.done) {
    finishHand();
    return;
  }
  if (state.toAct === VISITOR) {
    busy = false;
    setFlyState(flyEl, 'idle');
    paint();
    if (simN) {
      const view = viewFrom(state, VISITOR, foldRate[FLY]);
      const opts = [];
      for (let a = 0; a < 4; a++) if (view.legal[a]) opts.push(a);
      onVisitor(opts[(Math.random() * opts.length) | 0]);
    }
    return;
  }
  busy = true;
  setFlyState(flyEl, 'decide');
  paint();
  const view = viewFrom(state, FLY, foldRate[VISITOR]);
  const t0 = performance.now();
  const dec = await askFly(view);
  const wait = Math.max(0, 380 - (performance.now() - t0));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderBars(barsEl, dec.means, dec.action, !reduced);
  renderSparsity(sparseEl, dec.nFired, 5177);
  renderRaster(rasterEl, dec.fired, 5177);
  if (!reduced && wait && !simN) await sleep(wait);
  lastFlyAgg = dec.action === RAISE || dec.action === ALL_IN;
  noteFlyAction(stats, dec.action);
  setFlyState(flyEl, dec.action === ALL_IN ? 'allin' : (dec.action === RAISE ? 'raise' : 'idle'));
  applyAction(state, dec.action);
  assertChipConservation(state);
  paint();
  continueHand();
}

function finishHand() {
  busy = true;
  const flyDelta = state.stacks[FLY] - START_STACK;
  const visDelta = state.stacks[VISITOR] - START_STACK;
  if (state.winReason === 'fold') {
    foldCount[state.folded]++;
  }
  handCount[0]++;
  handCount[1]++;
  foldRate[0] = foldCount[0] / handCount[0];
  foldRate[1] = foldCount[1] / handCount[1];
  stats.hands++;
  if (state.winReason === 'showdown') {
    const visHand = [state.hole[VISITOR], ...state.up[VISITOR]];
    const strong = (eval5(visHand) >> 20) >= 2;
    noteShowdown(stats, strong, lastFlyAgg);
  }
  post({ type: 'outcome', chips: flyDelta });
  const msg = state.winner === VISITOR
    ? `You take ${state.winReason === 'fold' ? 'the pot (fly folded)' : 'the showdown'}. ${signed(visDelta)} chips.`
    : state.winner === FLY
      ? `Fly takes ${state.winReason === 'fold' ? 'the pot (you folded)' : 'the showdown'}. ${signed(flyDelta)} chips for the fly.`
      : `Split pot.`;
  setHandMsg(msg);
  setFlyState(flyEl, flyDelta > 8 ? 'win' : (flyDelta < -8 ? 'lose' : 'idle'));
  persist();
  renderRead(readEl, stats, resetMemory);
  if (simN && stats.hands >= simN) {
    statusEl.textContent = 'Simulated ' + stats.hands + ' hands. No stuck state.';
    busy = false;
    paint();
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(newHand, simN ? 0 : (reduced ? 400 : 1400));
}

function signed(n) {
  return (n >= 0 ? '+' : '') + n;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function persist() {
  try {
    if (stats.hands % 5 === 0) post({ type: 'export-delta' });
    else await saveMemory({ stats, savedAt: Date.now() });
  } catch (e) {
    console.error(e);
  }
}

async function resetMemory() {
  await clearMemory();
  stats = emptyStats();
  post({ type: 'reset' });
  renderRead(readEl, stats, resetMemory);
}

const simMatch = /(?:\?|&)sim=(\d+)/.exec(location.search);
const simN = simMatch ? Number(simMatch[1]) : 0;
post({
  type: 'init',
  metaUrl: new URL('weights/meta.json', location.href).href,
  weightUrl: new URL('weights/kc2mbon.i8.gz', location.href).href,
});
