import { ACTION_NAMES, FOLD, CALL, RAISE, ALL_IN, raiseSize } from './poker.js';

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

export function renderTable(el, state) {
  const vis = 0;
  const fly = 1;
  const pot = state.pot;
  const toCall = Math.max(0, state.currentBet - state.contrib[vis]);
  el.innerHTML = `
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
}

export function renderActions(el, view, onAct, disabled, done) {
  if (!el) return;
  if (done) {
    el.innerHTML = '';
    return;
  }
  if (disabled || !view) {
    el.innerHTML = '<p class="wait">Fly is thinking.</p>';
    return;
  }
  const raise = raiseSize(view.pot);
  const labels = [
    'Fold',
    view.toCall ? `Call ${view.toCall}` : 'Check',
    `Raise ${raise}`,
    'All-in',
  ];
  el.innerHTML = [FOLD, CALL, RAISE, ALL_IN].map((a) => {
    const on = view.legal[a];
    return `<button type="button" class="act a-${ACTION_NAMES[a]}" data-a="${a}" ${on ? '' : 'disabled'}>${labels[a]}</button>`;
  }).join('');
  el.querySelectorAll('button[data-a]').forEach((btn) => {
    btn.addEventListener('click', () => onAct(Number(btn.dataset.a)));
  });
}

export function setHandMsg(text) {
  const el = document.getElementById('hand-msg');
  if (el) el.textContent = text || '';
}
