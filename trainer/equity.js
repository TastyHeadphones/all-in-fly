import { eval5raw } from '../app/poker.js';

const TMP = new Uint8Array(52);

function remainingCards(view) {
  TMP.fill(0);
  TMP[view.myHole] = 1;
  for (let i = 0; i < view.myUp.length; i++) TMP[view.myUp[i]] = 1;
  for (let i = 0; i < view.oppUp.length; i++) TMP[view.oppUp[i]] = 1;
  const rem = [];
  for (let c = 0; c < 52; c++) if (!TMP[c]) rem.push(c);
  return rem;
}

function evalMine(view, extraMine) {
  const mine = [view.myHole];
  for (let i = 0; i < view.myUp.length; i++) mine.push(view.myUp[i]);
  for (let i = 0; i < extraMine.length; i++) mine.push(extraMine[i]);
  return eval5raw(mine[0], mine[1], mine[2], mine[3], mine[4]);
}

function evalOpp(oppHole, view, extraOpp) {
  const opp = [oppHole];
  for (let i = 0; i < view.oppUp.length; i++) opp.push(view.oppUp[i]);
  for (let i = 0; i < extraOpp.length; i++) opp.push(extraOpp[i]);
  return eval5raw(opp[0], opp[1], opp[2], opp[3], opp[4]);
}

export function equity(view, rng, samples = 160) {
  const rem = remainingCards(view);
  const myNeed = 4 - view.myUp.length;
  const oppNeed = 4 - view.oppUp.length;
  const extraNeed = myNeed + oppNeed;

  if (myNeed === 0 && oppNeed === 0) {
    let wins = 0, ties = 0;
    const n = rem.length;
    const mine = evalMine(view, []);
    for (let i = 0; i < n; i++) {
      const theirs = evalOpp(rem[i], view, []);
      if (mine > theirs) wins++;
      else if (mine === theirs) ties++;
    }
    return n ? (wins + 0.5 * ties) / n : 0.5;
  }

  const needDraw = 1 + extraNeed;
  let wins = 0, ties = 0;
  const nRem = rem.length;
  const extraMine = new Uint8Array(4);
  const extraOpp = new Uint8Array(4);
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < needDraw; i++) {
      const j = i + Math.floor(rng() * (nRem - i));
      const t = rem[i];
      rem[i] = rem[j];
      rem[j] = t;
    }
    const oppHole = rem[0];
    let k = 1;
    for (let i = 0; i < myNeed; i++) extraMine[i] = rem[k++];
    for (let i = 0; i < oppNeed; i++) extraOpp[i] = rem[k++];
    const mine = evalMine(view, extraMine.subarray(0, myNeed));
    const theirs = evalOpp(oppHole, view, extraOpp.subarray(0, oppNeed));
    if (mine > theirs) wins++;
    else if (mine === theirs) ties++;
  }
  return (wins + 0.5 * ties) / samples;
}
