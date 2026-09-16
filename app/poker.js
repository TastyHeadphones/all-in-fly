export const START_STACK = 100;
export const ANTE = 1;
export const MATCH_STACK = 500;
export const MATCH_ANTE = 5;
export const MAX_RAISES = 4;
export const FOLD = 0;
export const CALL = 1;
export const RAISE = 2;
export const ALL_IN = 3;
export const ACTION_NAMES = ['FOLD', 'CALL', 'RAISE', 'ALL-IN'];

export function mulberry32(a) {
  let t = a >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function raiseSize(pot) {
  return Math.max(1, Math.ceil(pot * 0.25));
}

const RC = new Uint8Array(13);

function pack(cat, k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0) {
  return (cat << 20) | (k0 << 16) | (k1 << 12) | (k2 << 8) | (k3 << 4) | k4;
}

function straightHighFromMask(mask) {
  for (let high = 12; high >= 4; high--) {
    const window = 0x1f << (high - 4);
    if ((mask & window) === window) return high;
  }
  if ((mask & 0b1000000001111) === 0b1000000001111) return 3;
  return -1;
}

export function eval5raw(c0, c1, c2, c3, c4) {
  const r0 = c0 >> 2, r1 = c1 >> 2, r2 = c2 >> 2, r3 = c3 >> 2, r4 = c4 >> 2;
  const flush = ((c0 & 3) === (c1 & 3)) && ((c1 & 3) === (c2 & 3)) &&
    ((c2 & 3) === (c3 & 3)) && ((c3 & 3) === (c4 & 3));
  RC.fill(0);
  RC[r0]++; RC[r1]++; RC[r2]++; RC[r3]++; RC[r4]++;
  let mask = 0;
  let four = -1, trips = -1;
  let p0 = -1, p1 = -1;
  let k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0;
  let nKick = 0;
  for (let r = 12; r >= 0; r--) {
    const n = RC[r];
    if (!n) continue;
    mask |= 1 << r;
    if (n === 4) four = r;
    else if (n === 3) trips = r;
    else if (n === 2) {
      if (p0 < 0) p0 = r;
      else p1 = r;
    } else {
      if (nKick === 0) k0 = r;
      else if (nKick === 1) k1 = r;
      else if (nKick === 2) k2 = r;
      else if (nKick === 3) k3 = r;
      else k4 = r;
      nKick++;
    }
  }
  const sHigh = straightHighFromMask(mask);
  if (flush && sHigh >= 0) return pack(8, sHigh);
  if (four >= 0) return pack(7, four, k0);
  if (trips >= 0 && p0 >= 0) return pack(6, trips, p0);
  if (flush) return pack(5, k0, k1, k2, k3, k4);
  if (sHigh >= 0) return pack(4, sHigh);
  if (trips >= 0) return pack(3, trips, k0, k1);
  if (p0 >= 0 && p1 >= 0) return pack(2, p0, p1, k0);
  if (p0 >= 0) return pack(1, p0, k0, k1, k2);
  return pack(0, k0, k1, k2, k3, k4);
}

export function eval5(cards) {
  return eval5raw(cards[0], cards[1], cards[2], cards[3], cards[4]);
}

export function evalShowing(cards) {
  const n = cards.length;
  if (n === 5) return eval5(cards);
  if (n === 0) return 0;
  RC.fill(0);
  for (let i = 0; i < n; i++) RC[cards[i] >> 2]++;
  let four = -1, trips = -1;
  const pairs = [];
  const kick = [];
  for (let r = 12; r >= 0; r--) {
    const c = RC[r];
    if (c === 4) four = r;
    else if (c === 3) trips = r;
    else if (c === 2) pairs.push(r);
    else if (c === 1) kick.push(r);
  }
  if (four >= 0) return pack(7, four, kick[0] || 0);
  if (trips >= 0 && pairs.length) return pack(6, trips, pairs[0]);
  if (trips >= 0) return pack(3, trips, kick[0] || 0, kick[1] || 0);
  if (pairs.length >= 2) return pack(2, pairs[0], pairs[1], kick[0] || 0);
  if (pairs.length === 1) return pack(1, pairs[0], kick[0] || 0, kick[1] || 0, kick[2] || 0);
  return pack(0, kick[0] || 0, kick[1] || 0, kick[2] || 0, kick[3] || 0);
}

function firstActor(state) {
  const a = state.up[0];
  const b = state.up[1];
  if (a.length === 1) {
    const c0 = a[0], c1 = b[0];
    const r0 = c0 >> 2, r1 = c1 >> 2;
    if (r0 !== r1) return r0 > r1 ? 0 : 1;
    return (c0 & 3) >= (c1 & 3) ? 0 : 1;
  }
  const e0 = evalShowing(a);
  const e1 = evalShowing(b);
  if (e0 !== e1) return e0 > e1 ? 0 : 1;
  return 0;
}

export function createHand(rng, opts = {}) {
  const deck = new Uint8Array(52);
  for (let i = 0; i < 52; i++) deck[i] = i;
  shuffle(deck, rng);
  const buyin = opts.buyin ?? START_STACK;
  const ante = opts.ante ?? ANTE;
  const s0 = opts.stacks ? opts.stacks[0] : buyin;
  const s1 = opts.stacks ? opts.stacks[1] : buyin;
  const a0 = Math.min(ante, Math.max(0, s0));
  const a1 = Math.min(ante, Math.max(0, s1));
  const state = {
    deck,
    deckPos: 4,
    hole: [deck[0], deck[1]],
    up: [[deck[2]], [deck[3]]],
    stacks: [s0 - a0, s1 - a1],
    pot: a0 + a1,
    street: 1,
    contrib: [0, 0],
    currentBet: 0,
    raisesThisStreet: 0,
    lastRaiseInc: 0,
    folded: -1,
    toAct: 0,
    pending: 2,
    history: [],
    done: false,
    winner: -1,
    winReason: '',
    tableChips: s0 + s1,
    ante,
    maxRaises: opts.maxRaises ?? MAX_RAISES,
    stackUnit: opts.stackUnit ?? buyin,
  };
  state.toAct = firstActor(state);
  if (state.stacks[state.toAct] === 0 && state.stacks[1 - state.toAct] > 0) {
    state.toAct = 1 - state.toAct;
    state.pending = 1;
  }
  return state;
}

export function cloneState(s) {
  return {
    deck: s.deck.slice(),
    deckPos: s.deckPos,
    hole: [s.hole[0], s.hole[1]],
    up: [s.up[0].slice(), s.up[1].slice()],
    stacks: [s.stacks[0], s.stacks[1]],
    pot: s.pot,
    street: s.street,
    contrib: [s.contrib[0], s.contrib[1]],
    currentBet: s.currentBet,
    raisesThisStreet: s.raisesThisStreet,
    lastRaiseInc: s.lastRaiseInc || 0,
    folded: s.folded,
    toAct: s.toAct,
    pending: s.pending,
    history: s.history.slice(),
    done: s.done,
    winner: s.winner,
    winReason: s.winReason,
    tableChips: s.tableChips,
    ante: s.ante,
    maxRaises: s.maxRaises,
    stackUnit: s.stackUnit,
  };
}

export function legalActions(state, p = state.toAct) {
  const legal = [false, false, false, false];
  const stack = state.stacks[p];
  if (stack <= 0 || state.done) return legal;
  const toCall = Math.max(0, state.currentBet - state.contrib[p]);
  const opp = 1 - p;
  const oppStack = state.stacks[opp];
  legal[FOLD] = toCall > 0;
  legal[CALL] = true;
  const inc = minRaiseInc(state);
  const raiseCost = toCall + inc;
  const oppCanCall = oppStack > 0;
  const cap = state.maxRaises ?? MAX_RAISES;
  legal[RAISE] = oppCanCall && stack > raiseCost && state.raisesThisStreet < cap;
  legal[ALL_IN] = oppCanCall && stack > toCall;
  return legal;
}

export function minRaiseInc(state) {
  return Math.max(state.ante || ANTE, state.lastRaiseInc || 0, 1);
}

export function minPut(state, p = state.toAct) {
  const toCall = Math.max(0, state.currentBet - state.contrib[p]);
  const stack = state.stacks[p];
  if (toCall === 0) return Math.min(minRaiseInc(state), stack);
  return Math.min(toCall + minRaiseInc(state), stack);
}

function dealUp(state) {
  state.up[0].push(state.deck[state.deckPos++]);
  state.up[1].push(state.deck[state.deckPos++]);
}

function settleUnmatched(state) {
  const d = state.contrib[0] - state.contrib[1];
  if (d > 0) {
    state.stacks[0] += d;
    state.pot -= d;
    state.contrib[0] -= d;
  } else if (d < 0) {
    state.stacks[1] += -d;
    state.pot -= -d;
    state.contrib[1] -= -d;
  }
}

function awardPot(state) {
  if (state.winner === -1) {
    const half = Math.floor(state.pot / 2);
    state.stacks[0] += half;
    state.stacks[1] += half;
    if (state.pot - 2 * half) state.stacks[0] += 1;
  } else {
    state.stacks[state.winner] += state.pot;
  }
  state.pot = 0;
}

export function completedHands(state) {
  const up0 = state.up[0].slice();
  const up1 = state.up[1].slice();
  let pos = state.deckPos;
  while (up0.length < 4) {
    up0.push(state.deck[pos++]);
    up1.push(state.deck[pos++]);
  }
  return {
    h0: [state.hole[0], up0[0], up0[1], up0[2], up0[3]],
    h1: [state.hole[1], up1[0], up1[1], up1[2], up1[3]],
  };
}

function showdown(state) {
  settleUnmatched(state);
  while (state.up[0].length < 4) dealUp(state);
  const h0 = [state.hole[0], state.up[0][0], state.up[0][1], state.up[0][2], state.up[0][3]];
  const h1 = [state.hole[1], state.up[1][0], state.up[1][1], state.up[1][2], state.up[1][3]];
  const e0 = eval5(h0);
  const e1 = eval5(h1);
  state.done = true;
  state.winReason = 'showdown';
  if (e0 > e1) state.winner = 0;
  else if (e1 > e0) state.winner = 1;
  else state.winner = -1;
  awardPot(state);
}

function nextStreetOrShow(state) {
  settleUnmatched(state);
  if (state.street === 4 || state.stacks[0] === 0 || state.stacks[1] === 0) {
    showdown(state);
    return;
  }
  state.street += 1;
  dealUp(state);
  state.contrib[0] = 0;
  state.contrib[1] = 0;
  state.currentBet = 0;
  state.raisesThisStreet = 0;
  state.lastRaiseInc = 0;
  state.pending = 2;
  if (state.stacks[0] === 0 || state.stacks[1] === 0) {
    showdown(state);
    return;
  }
  state.toAct = firstActor(state);
}

export function applyAction(state, action, raiseInc) {
  if (state.done) throw new Error('action on finished hand');
  const p = state.toAct;
  const o = 1 - p;
  const legal = legalActions(state, p);
  if (!legal[action]) throw new Error('illegal action ' + ACTION_NAMES[action]);
  const toCall = Math.max(0, state.currentBet - state.contrib[p]);
  const stack = state.stacks[p];

  if (action === FOLD) {
    state.history.push({ p, action, street: state.street, put: 0 });
    state.folded = p;
    state.done = true;
    state.winner = o;
    state.winReason = 'fold';
    awardPot(state);
    return;
  }

  let put = 0;
  if (action === CALL) put = Math.min(toCall, stack);
  else if (action === RAISE) {
    const inc = raiseInc != null ? Math.max(1, raiseInc | 0) : raiseSize(state.pot);
    put = Math.min(toCall + inc, stack);
  } else put = stack;

  state.stacks[p] -= put;
  state.pot += put;
  state.contrib[p] += put;
  const raised = state.contrib[p] > state.currentBet;
  if (raised) {
    const inc = state.contrib[p] - state.currentBet;
    state.currentBet = state.contrib[p];
    state.raisesThisStreet += 1;
    state.lastRaiseInc = inc;
  }
  state.history.push({ p, action, street: state.street, put });

  if (state.history.length > 80) throw new Error('runaway betting');

  if (raised) state.pending = state.stacks[o] > 0 ? 1 : 0;
  else state.pending -= 1;

  if (state.pending <= 0 || state.stacks[o] === 0) {
    nextStreetOrShow(state);
    return;
  }
  state.toAct = o;
  if (state.stacks[state.toAct] === 0) nextStreetOrShow(state);
}

export function viewFrom(state, p, oppFoldRate = 0) {
  const o = 1 - p;
  const toCall = Math.max(0, state.currentBet - state.contrib[p]);
  const oppActs = [];
  let agg = 0;
  for (let i = 0; i < state.history.length; i++) {
    const h = state.history[i];
    if (h.p !== o) continue;
    oppActs.push(h.action);
    if (h.action === RAISE || h.action === ALL_IN) agg += 1;
  }
  const n = oppActs.length;
  const unit = state.stackUnit || START_STACK;
  const k = START_STACK / unit;
  return {
    myHole: state.hole[p],
    myUp: state.up[p].slice(),
    oppUp: state.up[o].slice(),
    myStack: Math.round(state.stacks[p] * k),
    oppStack: Math.round(state.stacks[o] * k),
    pot: Math.round(state.pot * k),
    toCall: Math.round(toCall * k),
    street: state.street,
    legal: legalActions(state, p),
    oppLastActions: oppActs.slice(-3),
    oppAggression: n ? agg / n : 0,
    oppFoldRate,
    player: p,
    rawToCall: toCall,
    rawStack: state.stacks[p],
    rawPot: state.pot,
  };
}

export function assertChipConservation(state) {
  const total = state.stacks[0] + state.stacks[1] + state.pot;
  const expect = state.tableChips != null ? state.tableChips : START_STACK * 2;
  if (total !== expect) {
    throw new Error('chip conservation failed: ' + total);
  }
}
