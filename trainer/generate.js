import {
  ALL_IN, CALL, FOLD, START_STACK,
  applyAction, assertChipConservation, cloneState, completedHands, createHand,
  eval5, viewFrom,
} from '../app/poker.js';
import { TEACHER_MC, teacherDecide } from './teacher.js';

export function isWorstPossible(view) {
  const cards = [view.myHole];
  for (let i = 0; i < view.myUp.length; i++) cards.push(view.myUp[i]);
  if (cards.length === 5) {
    const s = eval5(cards);
    return (s >> 20) === 0 && ((s >> 16) & 0xf) <= 5;
  }
  const seen = new Uint8Array(13);
  let high = 0;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i] >> 2;
    if (seen[r]) return false;
    seen[r] = 1;
    if (r > high) high = r;
  }
  return high <= 5;
}

export function randomLegal(view, rng) {
  const opts = [];
  for (let a = 0; a < 4; a++) if (view.legal[a]) opts.push(a);
  return opts[(rng() * opts.length) | 0];
}

export function playHand(rng, choose0, choose1, foldRate) {
  if (!foldRate) foldRate = [0, 0];
  const state = createHand(rng);
  const decisions = [];
  while (!state.done) {
    const p = state.toAct;
    const view = viewFrom(state, p, foldRate[1 - p]);
    const action = p === 0 ? choose0(view, state) : choose1(view, state);
    if (!view.legal[action]) {
      throw new Error('agent chose illegal ' + action + ' legal=' + view.legal);
    }
    decisions.push({
      player: p,
      view,
      action,
      snapshot: cloneState(state),
    });
    applyAction(state, action);
  }
  assertChipConservation(state);
  return { state, decisions };
}

function noteFold(state, foldCount, handCount, foldRate) {
  if (state.winReason === 'fold') foldCount[state.folded]++;
  handCount[0]++;
  handCount[1]++;
  foldRate[0] = foldCount[0] / handCount[0];
  foldRate[1] = foldCount[1] / handCount[1];
}

export function collectTeacherSituations(nHands, rng, samples = TEACHER_MC) {
  const teacher = (view) => teacherDecide(view, samples);
  const foldCount = [0, 0];
  const handCount = [0, 0];
  const foldRate = [0, 0];
  const items = [];
  const dist = [0, 0, 0, 0];
  for (let h = 0; h < nHands; h++) {
    const { state, decisions } = playHand(rng, teacher, teacher, foldRate);
    for (const d of decisions) {
      items.push({ view: d.view, teacherAction: d.action });
      dist[d.action]++;
    }
    noteFold(state, foldCount, handCount, foldRate);
  }
  return { items, dist, actions: items.length, hands: nHands };
}

export function playMatch(nHands, rng, choose0, choose1) {
  let chipsFly = 0;
  let foldedBest = 0;
  let calledWorst = 0;
  let illegal = 0;
  let negative = 0;
  const actDist = [0, 0, 0, 0];
  const foldCount = [0, 0];
  const handCount = [0, 0];
  const foldRateAgent = [0, 0];
  for (let h = 0; h < nHands; h++) {
    const flySeat = h % 2;
    const a0 = flySeat === 0 ? choose0 : choose1;
    const a1 = flySeat === 0 ? choose1 : choose0;
    const foldRate = flySeat === 0
      ? [foldRateAgent[0], foldRateAgent[1]]
      : [foldRateAgent[1], foldRateAgent[0]];
    const { state, decisions } = playHand(rng, a0, a1, foldRate);
    chipsFly += state.stacks[flySeat] - START_STACK;
    if (state.stacks[0] < 0 || state.stacks[1] < 0) negative++;
    if (state.winReason === 'fold') {
      const folderIsFly = state.folded === flySeat;
      foldCount[folderIsFly ? 0 : 1]++;
    }
    handCount[0]++;
    handCount[1]++;
    foldRateAgent[0] = foldCount[0] / handCount[0];
    foldRateAgent[1] = foldCount[1] / handCount[1];
    for (const d of decisions) {
      actDist[d.action]++;
      if (d.player !== flySeat) continue;
      if (d.action === FOLD && d.snapshot.street === 4) {
        const { h0, h1 } = completedHands(d.snapshot);
        const flyScore = flySeat === 0 ? eval5(h0) : eval5(h1);
        const oppScore = flySeat === 0 ? eval5(h1) : eval5(h0);
        if (flyScore > oppScore) foldedBest++;
      }
      if ((d.action === CALL || d.action === ALL_IN) && d.view.toCall > 0) {
        const last = d.view.oppLastActions;
        const oppShove = last.length && last[last.length - 1] === ALL_IN;
        if (oppShove && isWorstPossible(d.view)) calledWorst++;
      }
    }
  }
  return {
    chipsPer100: (chipsFly / nHands) * 100,
    foldedBestPer1000: (foldedBest / nHands) * 1000,
    calledWorstPer1000: (calledWorst / nHands) * 1000,
    illegal,
    negative,
    actDist,
    nHands,
  };
}

export function naturalEvalSet(nHands, rng, samples = TEACHER_MC) {
  const teacher = (view) => teacherDecide(view, samples);
  const foldCount = [0, 0];
  const handCount = [0, 0];
  const foldRate = [0, 0];
  const items = [];
  for (let h = 0; h < nHands; h++) {
    const { state, decisions } = playHand(rng, teacher, teacher, foldRate);
    for (const d of decisions) {
      items.push({ view: d.view, teacherAction: d.action });
    }
    noteFold(state, foldCount, handCount, foldRate);
  }
  return items;
}
