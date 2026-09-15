import { rate } from './online.js';

export function renderRead(el, stats, onReset) {
  if (!el) return;
  const hands = stats.hands;
  const foldAgg = rate(stats.visitorFoldToAgg.folds, stats.visitorFoldToAgg.n);
  const streets = ['1st', '3rd', '4th', '5th'];
  const raiseRows = streets.map((label, i) => {
    const r = rate(stats.visitorRaise[i], stats.visitorStreet[i]);
    return `<li>${label} street raise ${pct(r)} <span class="muted">(${stats.visitorStreet[i]} acts)</span></li>`;
  }).join('');
  const strong = rate(stats.visitorStrongAgg.agg, stats.visitorStrongAgg.n);
  const flyNow = dist(stats.flyDist);
  const fly0 = dist(stats.flyDist0);
  const callDiff = flyNow[1] - fly0[1];
  const callMsg = hands >= 8
    ? `After ${hands} hands, this fly calls you ${signedPct(callDiff)} in the first ${Math.min(20, stats.flyHands0)} hands.`
    : 'Play more hands to see how the fly’s impression of you diverges from the bootstrap.';

  el.innerHTML = `
    <h2>What the fly has learned about you</h2>
    <p class="lede">From this browser only — ${hands} hands, no server, no other visitors.</p>
    <ul class="read-list">
      <li>You fold to a raise or shove ${pct(foldAgg)} of the time it has seen you face one.</li>
      ${raiseRows}
      <li>When you later show a strong hand, your earlier aggression was ${pct(strong)}.</li>
    </ul>
    <p class="diff">${callMsg}</p>
    <button type="button" class="reset" id="reset-fly">Reset the fly’s memory of me</button>
  `;
  const btn = el.querySelector('#reset-fly');
  if (btn) btn.addEventListener('click', onReset);
}

function pct(x) {
  return (x * 100).toFixed(0) + '%';
}

function signedPct(x) {
  const p = (x * 100).toFixed(0);
  if (x > 0.005) return p + '% more often than';
  if (x < -0.005) return Math.abs(p) + '% less often than';
  return 'about as often as it did';
}

function dist(counts) {
  const n = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map((c) => c / n);
}
