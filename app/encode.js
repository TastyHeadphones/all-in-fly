export const N_PN = 680;
export const RATE_ON = 270;
export const RATE_BG = 20;

export const PN_GROUPS = [
  { name: 'my_cards', start: 0, count: 208 },
  { name: 'opp_cards', start: 208, count: 208 },
  { name: 'rank_presence', start: 416, count: 104 },
  { name: 'suit_counts', start: 520, count: 32 },
  { name: 'betting', start: 552, count: 80 },
  { name: 'history', start: 632, count: 48 },
];

export function assertPnDisjoint() {
  const used = new Uint8Array(N_PN);
  for (const g of PN_GROUPS) {
    if (g.start < 0 || g.start + g.count > N_PN) {
      throw new Error('PN group OOB: ' + g.name);
    }
    for (let i = 0; i < g.count; i++) {
      const idx = g.start + i;
      if (used[idx]) throw new Error('PN overlap at ' + idx + ' (' + g.name + ')');
      used[idx] = 1;
    }
  }
  for (let i = 0; i < N_PN; i++) {
    if (!used[i]) throw new Error('unassigned PN ' + i);
  }
}

function logBins(x, max) {
  const t = Math.log(1 + Math.max(0, x)) / Math.log(1 + max);
  return Math.round(Math.min(1, Math.max(0, t)) * 16);
}

function thermo(out, offset, nBins, filled) {
  const n = filled < 0 ? 0 : filled > nBins ? nBins : filled | 0;
  for (let i = 0; i < nBins; i++) out[offset + i] = i < n ? RATE_ON : RATE_BG;
}

function setCard(out, base, card) {
  const o = base + card * 4;
  out[o] = RATE_ON;
  out[o + 1] = RATE_ON;
  out[o + 2] = RATE_ON;
  out[o + 3] = RATE_ON;
}

export function encode(view, out) {
  if (!out) out = new Float32Array(N_PN);
  out.fill(RATE_BG);

  setCard(out, 0, view.myHole);
  for (let i = 0; i < view.myUp.length; i++) setCard(out, 0, view.myUp[i]);
  for (let i = 0; i < view.oppUp.length; i++) setCard(out, 208, view.oppUp[i]);

  const myRank = new Uint8Array(13);
  const oppRank = new Uint8Array(13);
  const mySuit = new Uint8Array(4);
  const oppSuit = new Uint8Array(4);
  myRank[view.myHole >> 2]++;
  mySuit[view.myHole & 3]++;
  for (let i = 0; i < view.myUp.length; i++) {
    const c = view.myUp[i];
    myRank[c >> 2]++;
    mySuit[c & 3]++;
  }
  for (let i = 0; i < view.oppUp.length; i++) {
    const c = view.oppUp[i];
    oppRank[c >> 2]++;
    oppSuit[c & 3]++;
  }
  let off = 416;
  for (let r = 0; r < 13; r++) {
    thermo(out, off, 4, myRank[r]);
    off += 4;
    thermo(out, off, 4, oppRank[r]);
    off += 4;
  }
  for (let s = 0; s < 4; s++) {
    thermo(out, off, 4, mySuit[s]);
    off += 4;
    thermo(out, off, 4, oppSuit[s]);
    off += 4;
  }

  off = 552;
  thermo(out, off, 16, view.street * 4);
  off += 16;
  thermo(out, off, 16, logBins(view.pot, 200));
  off += 16;
  thermo(out, off, 16, logBins(view.toCall, 100));
  off += 16;
  thermo(out, off, 16, logBins(view.myStack, 100));
  off += 16;
  thermo(out, off, 16, logBins(view.oppStack, 100));

  off = 632;
  const acts = view.oppLastActions;
  const nAct = acts.length;
  for (let slot = 0; slot < 3; slot++) {
    const src = slot - (3 - nAct);
    if (src >= 0) {
      const a = acts[src];
      const base = off + slot * 8 + a * 2;
      out[base] = RATE_ON;
      out[base + 1] = RATE_ON;
    }
  }
  off = 656;
  thermo(out, off, 12, Math.round((view.oppAggression || 0) * 12));
  off += 12;
  thermo(out, off, 12, Math.round((view.oppFoldRate || 0) * 12));
  return out;
}
