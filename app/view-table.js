import { FOLD, CALL, RAISE, ALL_IN } from './poker.js';

const RANK = 'A23456789TJQK';
const SUIT = ['♣', '♦', '♥', '♠'];

export function cardHtml(card, faceDown) {
  if (faceDown || card == null) {
    return '<div class="card back" aria-label="face down"></div>';
  }
  const r = card >> 2;
  const s = card & 3;
  const red = s === 1 || s === 2;
  const label = (RANK[r] === 'T' ? '10' : RANK[r]) + SUIT[s];
  return `<div class="card ${red ? 'red' : 'black'}" aria-label="${label}"><span class="r">${RANK[r] === 'T' ? '10' : RANK[r]}</span><span class="s">${SUIT[s]}</span></div>`;
}

export function renderTable(el, state, match) {
  const vis = 0;
  const fly = 1;
  const pot = state.pot;
  const toCall = Math.max(0, state.currentBet - state.contrib[vis]);
  const over = match && match.over;
  el.innerHTML = `
    <div class="match-bar">
      <span>Match <span class="mono">${state.stacks[vis]}</span> you · <span class="mono">${state.stacks[fly]}</span> fly</span>
      <span class="muted">buy-in 500 · ante 5</span>
      <button type="button" class="new-game-sm" id="new-game-top">New game</button>
    </div>
    <div class="seat fly-seat">
      <div class="seat-meta"><span class="who">Fly</span><span class="stack mono">${state.stacks[fly]}</span></div>
      <div class="cards">${state.up[fly].map((c) => cardHtml(c, false)).join('')}${state.done ? cardHtml(state.hole[fly], false) : cardHtml(null, true)}</div>
    </div>
    <div class="pot-row">
      <div class="pot"><span class="lbl">pot</span> <span class="mono">${pot}</span></div>
      <div class="tocall"><span class="lbl">to call</span> <span class="mono">${toCall}</span></div>
    </div>
    <div class="seat you-seat">
      <div class="cards">${cardHtml(state.hole[vis], false)}${state.up[vis].map((c) => cardHtml(c, false)).join('')}</div>
      <div class="seat-meta"><span class="who">You</span><span class="stack mono">${state.stacks[vis]}</span></div>
    </div>
    <div class="actions" id="actions"></div>
    <div class="hand-msg" id="hand-msg"></div>
  `;
  if (over) {
    const youWin = match.stacks[vis] > 0;
    el.insertAdjacentHTML('beforeend', `<div class="game-over">${youWin ? 'You win this game. The fly is broke.' : 'You lose this game. You are out of chips.'}<button type="button" class="act" id="new-game">New game (500 each)</button></div>`);
  }
}

export function renderActions(el, view, onAct, disabled, done, opts = {}) {
  if (!el) return;
  if (opts.gameOver) {
    el.innerHTML = '';
    return;
  }
  if (done) {
    el.innerHTML = '';
    return;
  }
  if (disabled || !view) {
    el.innerHTML = '<p class="wait">Fly is thinking.</p>';
    return;
  }
  const stack = view.rawStack != null ? view.rawStack : view.myStack;
  const toCall = view.rawToCall != null ? view.rawToCall : view.toCall;
  const pot = view.rawPot != null ? view.rawPot : view.pot;
  const minRaisePut = Math.min(stack, opts.minPut != null ? opts.minPut : (toCall === 0 ? 5 : toCall + 5));
  let put = opts.betPut != null ? opts.betPut : minRaisePut;
  if (put < minRaisePut) put = minRaisePut;
  if (put > stack) put = stack;

  const labels = {
    fold: 'Fold',
    call: toCall ? `Call ${toCall}` : 'Check',
    raise: toCall ? `Raise to ${put}` : `Bet ${put}`,
    allin: `All-in ${stack}`,
  };

  const presets = [10, 25, 50, 100]
    .filter((n) => n >= minRaisePut && n < stack)
    .concat(Math.min(stack, Math.max(minRaisePut, Math.ceil(pot / 4))))
    .concat(Math.min(stack, Math.max(minRaisePut, Math.ceil(pot / 2))))
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  el.innerHTML = `
    <div class="bet-ctrl">
      <label class="bet-label" for="bet-put">Chips this round <span class="mono" id="bet-put-val">${put}</span></label>
      <input id="bet-put" type="range" min="${minRaisePut}" max="${stack}" value="${put}" ${view.legal[RAISE] || view.legal[ALL_IN] ? '' : 'disabled'}>
      <div class="presets">${presets.map((n) => `<button type="button" class="chip" data-put="${n}">${n}</button>`).join('')}</div>
    </div>
    <div class="act-row">
      <button type="button" class="act" data-a="${FOLD}" ${view.legal[FOLD] ? '' : 'disabled'}>${labels.fold}</button>
      <button type="button" class="act" data-a="${CALL}" ${view.legal[CALL] ? '' : 'disabled'}>${labels.call}</button>
      <button type="button" class="act" data-a="${RAISE}" ${view.legal[RAISE] && put > toCall && put < stack ? '' : 'disabled'}>${labels.raise}</button>
      <button type="button" class="act" data-a="${ALL_IN}" ${view.legal[ALL_IN] ? '' : 'disabled'}>${labels.allin}</button>
    </div>
  `;

  const range = el.querySelector('#bet-put');
  const valEl = el.querySelector('#bet-put-val');
  const raiseBtn = el.querySelector(`[data-a="${RAISE}"]`);
  function syncPut(n) {
    n = Math.max(minRaisePut, Math.min(stack, n | 0));
    if (range) range.value = String(n);
    if (valEl) valEl.textContent = String(n);
    if (raiseBtn) {
      raiseBtn.textContent = toCall ? `Raise to ${n}` : `Bet ${n}`;
      raiseBtn.disabled = !(view.legal[RAISE] && n > toCall && n < stack);
    }
    if (opts.onBetPut) opts.onBetPut(n);
    return n;
  }
  if (range) {
    range.addEventListener('input', () => syncPut(Number(range.value)));
  }
  el.querySelectorAll('[data-put]').forEach((btn) => {
    btn.addEventListener('click', () => syncPut(Number(btn.dataset.put)));
  });
  el.querySelectorAll('button[data-a]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = Number(btn.dataset.a);
      const cur = range ? Number(range.value) : put;
      onAct(a, cur);
    });
  });
}

export function setHandMsg(text) {
  const el = document.getElementById('hand-msg');
  if (el) el.textContent = text || '';
}
