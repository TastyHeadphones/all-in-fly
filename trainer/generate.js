import {
  ALL_IN, CALL, FOLD, START_STACK,
  applyAction, assertChipConservation, cloneState, completedHands, createHand,
  eval5, viewFrom,
} from '../app/poker.js';
import { teacherDecide } from './teacher.js';

function isWorstPossible(view) {
  const ranks = [view.myHole >> 2];
  for (let i = 0; i < view.myUp.length; i++) ranks.push(view.myUp[i] >> 2);
  const seen = new Uint8Array(13);
  let high = 0;
  for (let i = 0; i < ranks.length; i++) {
    const r = ranks[i];
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

export function alwaysFold(view) {
  if (view.legal[FOLD]) return FOLD;
  return CALL;
}

export function alwaysShove(view) {
  if (view.legal[ALL_IN]) return ALL_IN;
  if (view.legal[RAISE]) return RAISE;
  if (view.legal[CALL]) return CALL;
  return FOLD;
}

export function playHand(rng, choose0, choose1, foldRate = [0, 0]) {
  const state = createHand(rng);
  const decisions = [];
  while (!state.done) {
    const p = state.toAct;
    const view = viewFrom(state, p);
    view.oppFoldRate = foldRate[1 - p];
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

export function collectTeacherSituations(nHands, rng, samples = 140) {
  const buckets = [[], [], [], []];
  const teacher = (view) => teacherDecide(view, samples);
  const foldCount = [0, 0];
  const handCount = [0, 0];
  const foldRate = [0, 0];
  let hands = 0;
  let actions = 0;
  const dist = [0, 0, 0, 0];
  while (hands < nHands) {
    const { state, decisions } = playHand(rng, teacher, teacher, foldRate);
    hands++;
    for (const d of decisions) {
      const labelled = { ...d.view, teacherAction: d.action };
      buckets[d.action].push(labelled);
      dist[d.action]++;
      actions++;
    }
    if (state.winReason === 'fold') {
      foldCount[state.folded]++;
    }
    handCount[0]++;
    handCount[1]++;
    foldRate[0] = foldCount[0] / handCount[0];
    foldRate[1] = foldCount[1] / handCount[1];
  }
  return { buckets, dist, actions, hands };
}

export function playMatch(nHands, rng, choose0, choose1, opts = {}) {
  let chipsFly = 0;
  let foldedBest = 0;
  let calledWorst = 0;
  let illegal = 0;
  let negative = 0;
  const actDist = [0, 0, 0, 0];
  const teacherFn = opts.teacherFn || null;
  for (let h = 0; h < nHands; h++) {
    const flySeat = h % 2;
    const a0 = flySeat === 0 ? choose0 : choose1;
    const a1 = flySeat === 0 ? choose1 : choose0;
    const { state, decisions } = playHand(rng, a0, a1);
    chipsFly += state.stacks[flySeat] - START_STACK;
    if (state.stacks[0] < 0 || state.stacks[1] < 0) negative++;
    for (const d of decisions) {
      actDist[d.action]++;
      if (d.player !== flySeat) continue;
      if (d.action === FOLD && d.snapshot.street === 4) {
        const { h0, h1 } = completedHands(d.snapshot);
        const flyScore = flySeat === 0 ? eval5(h0) : eval5(h1);
        const oppScore = flySeat === 0 ? eval5(h1) : eval5(h0);
        let mistake = flyScore > oppScore;
        if (mistake && teacherFn) {
          const t = teacherFn(d.view);
          if (t === FOLD) mistake = false;
        }
        if (mistake) foldedBest++;
      }
      if ((d.action === CALL || d.action === ALL_IN) && d.view.toCall > 0) {
        const oppShove = d.view.oppLastActions.length &&
          d.view.oppLastActions[d.view.oppLastActions.length - 1] === ALL_IN;
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

export function naturalEvalSet(nHands, rng, samples = 140) {
  const teacher = (view) => teacherDecide(view, samples);
  const items = [];
  for (let h = 0; h < nHands; h++) {
    const { decisions } = playHand(rng, teacher, teacher);
    for (const d of decisions) {
      items.push({ view: d.view, teacherAction: d.action });
    }
  }
  return items;
}
