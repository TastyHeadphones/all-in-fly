import {
  ALL_IN, MATCH_ANTE, MATCH_STACK, RAISE,
  applyAction, assertChipConservation, createHand, eval5, minPut, mulberry32,
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
let match = { stacks: [MATCH_STACK, MATCH_STACK], over: false };
let handStart = [MATCH_STACK, MATCH_STACK];
let busy = false;
let stats = emptyStats();
let foldRate = [0, 0];
let foldCount = [0, 0];
let handCount = [0, 0];
let pending = null;
let lastFlyAgg = false;
let betPut = 5;
let gen = 0;

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
      newGame();
    }).catch(() => newGame());
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

function newGame() {
  gen += 1;
  pending = null;
  busy = false;
  match = { stacks: [MATCH_STACK, MATCH_STACK], over: false };
  betPut = MATCH_ANTE;
  statusEl.textContent = statusEl.textContent.replace(/ · game over.*/, '');
  newHand();
}

function newHand() {
  if (match.over) {
    paint();
    return;
  }
  if (match.stacks[VISITOR] <= 0 || match.stacks[FLY] <= 0) {
    match.over = true;
    paint();
    return;
  }
  handStart = match.stacks.slice();
  state = createHand(mulberry32((Date.now() ^ Math.random() * 1e9) >>> 0), {
    stacks: handStart,
    buyin: MATCH_STACK,
    ante: MATCH_ANTE,
    maxRaises: 99,
    stackUnit: MATCH_STACK,
  });
  lastFlyAgg = false;
  betPut = minPut(state, VISITOR);
  setFlyState(flyEl, 'idle');
  setHandMsg('');
  paint();
  continueHand();
}

function paint() {
  const show = state || {
    pot: 0, contrib: [0, 0], currentBet: 0, stacks: match.stacks,
    up: [[], []], hole: [null, null], done: true, toAct: 0,
  };
  renderTable(tableEl, show, match);
  renderRead(readEl, stats, resetMemory);
  const ng = document.getElementById('new-game');
  if (ng) ng.addEventListener('click', newGame);
  const ngTop = document.getElementById('new-game-top');
  if (ngTop) ngTop.addEventListener('click', newGame);
  if (match.over || !state) {
    if (match.over) {
      const youWin = match.stacks[VISITOR] > 0;
      statusEl.textContent = (statusEl.textContent.split(' · game over')[0]) +
        (youWin ? ' · game over — you win' : ' · game over — you lose');
    }
    return;
  }
  const view = viewFrom(state, VISITOR, foldRate[FLY]);
  const acts = document.getElementById('actions');
  const ourTurn = !state.done && state.toAct === VISITOR && !busy;
  renderActions(acts, view, onVisitor, !ourTurn, state.done, {
    gameOver: match.over,
    betPut,
    minPut: minPut(state, VISITOR),
    onBetPut: (n) => { betPut = n; },
  });
  const next = document.getElementById('next-round');
  if (next) next.addEventListener('click', newHand);
}

function onVisitor(action, put) {
  if (busy || match.over || !state || state.done || state.toAct !== VISITOR) return;
  const view = viewFrom(state, VISITOR, foldRate[FLY]);
  if (!view.legal[action]) return;
  noteVisitorAction(stats, view.street, action, lastFlyAgg);
  const toCall = view.rawToCall;
  if (action === RAISE) {
    const want = put != null ? put : betPut;
    if (want >= view.rawStack && view.legal[ALL_IN]) applyAction(state, ALL_IN);
    else applyAction(state, RAISE, Math.max(1, want - toCall));
  } else {
    applyAction(state, action);
  }
  assertChipConservation(state);
  paint();
  continueHand();
}

async function continueHand() {
  if (!state || match.over) return;
  if (state.done) {
    finishHand();
    return;
  }
  if (state.stacks[state.toAct] === 0) {
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
      const a = opts[(Math.random() * opts.length) | 0];
      const put = a === RAISE
        ? Math.min(view.rawStack - 1, Math.max(minPut(state, VISITOR), view.rawToCall + MATCH_ANTE))
        : view.rawStack;
      onVisitor(a, put);
    }
    return;
  }
  busy = true;
  const g = gen;
  setFlyState(flyEl, 'decide');
  paint();
  const view = viewFrom(state, FLY, foldRate[VISITOR]);
  const t0 = performance.now();
  const dec = await askFly(view);
  if (g !== gen || !state || match.over) return;
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
  match.stacks = [state.stacks[VISITOR], state.stacks[FLY]];
  const flyDelta = match.stacks[FLY] - handStart[FLY];
  const visDelta = match.stacks[VISITOR] - handStart[VISITOR];
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
  setFlyState(flyEl, flyDelta > 20 ? 'win' : (flyDelta < -20 ? 'lose' : 'idle'));
  persist();
  renderRead(readEl, stats, resetMemory);

  if (match.stacks[VISITOR] <= 0 || match.stacks[FLY] <= 0) {
    match.over = true;
    busy = false;
    paint();
    return;
  }

  if (simN && stats.hands >= simN) {
    statusEl.textContent = 'Simulated ' + stats.hands + ' hands. No stuck state.';
    busy = false;
    paint();
    return;
  }
  if (simN) {
    setTimeout(newHand, 0);
    return;
  }
  busy = false;
  paint();
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
