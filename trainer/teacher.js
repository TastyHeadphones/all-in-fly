import { ALL_IN, CALL, FOLD, RAISE, mulberry32 } from '../app/poker.js';
import { equity } from './equity.js';

export const TEACHER_MC = 160;

function seedFromView(view) {
  let s = (view.myHole + 1) * 17;
  s = (s + view.pot * 31 + view.toCall * 13 + view.street * 101 + view.myStack * 7) >>> 0;
  for (let i = 0; i < view.myUp.length; i++) s = (s * 33 + view.myUp[i] + 1) >>> 0;
  for (let i = 0; i < view.oppUp.length; i++) s = (s * 37 + view.oppUp[i] + 1) >>> 0;
  return s || 1;
}

export function teacherEquity(view, samples = TEACHER_MC) {
  const rng = mulberry32(seedFromView(view));
  return equity(view, rng, samples);
}

function pickLegal(want, legal, eq) {
  if (legal[want]) return want;
  if (want === ALL_IN && legal[RAISE]) return RAISE;
  if (want === RAISE && eq >= 0.78 && legal[ALL_IN]) return ALL_IN;
  if (want === RAISE && legal[CALL]) return CALL;
  if (want === FOLD && legal[FOLD]) return FOLD;
  if (legal[CALL]) return CALL;
  if (legal[FOLD]) return FOLD;
  if (legal[ALL_IN]) return ALL_IN;
  if (legal[RAISE]) return RAISE;
  return CALL;
}

export function teacherPolicy(view, eq) {
  const legal = view.legal;
  const toCall = view.toCall;
  const pot = view.pot;
  const stack = view.myStack;
  const street = view.street;

  let want;
  if (toCall === 0) {
    if (eq >= 0.80 || (eq >= 0.74 && street >= 3)) want = ALL_IN;
    else if (eq >= 0.56) want = RAISE;
    else want = CALL;
  } else {
    const odds = toCall / (pot + toCall);
    if (eq + 1e-9 < odds * 0.95) want = FOLD;
    else if (eq >= 0.80 || (eq >= 0.72 && (stack <= pot * 1.25 || street >= 3))) want = ALL_IN;
    else if (eq >= 0.64 && eq > odds + 0.12) want = RAISE;
    else want = CALL;
  }
  return pickLegal(want, legal, eq);
}

export function teacherDecide(view, samples = TEACHER_MC) {
  const eq = teacherEquity(view, samples);
  return teacherPolicy(view, eq);
}
