const NAMES = ['FOLD', 'CALL', 'RAISE', 'ALL-IN'];

export function renderBars(el, means, winner, animate) {
  if (!el) return;
  const finite = means.map((m) => (Number.isFinite(m) ? m : 0));
  const mx = Math.max(...finite);
  const mn = Math.min(...finite);
  const span = Math.max(1, mx - mn);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.innerHTML = NAMES.map((name, i) => {
    const v = finite[i];
    const pref = (mx - v) / span;
    const w = Math.round(8 + pref * 92);
    const win = i === winner;
    return `<div class="bar-row ${win ? 'win' : ''}">
      <span class="bar-name">${name}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${animate && !reduced ? 0 : w}%" data-w="${w}"></span></span>
      <span class="bar-val mono">${v.toFixed(0)}</span>
    </div>`;
  }).join('') + `<p class="bar-note">Lowest drive wins. Winner: <strong>${NAMES[winner] || '—'}</strong></p>`;
  if (animate && !reduced) {
    requestAnimationFrame(() => {
      el.querySelectorAll('.bar-fill').forEach((n) => {
        n.style.width = n.dataset.w + '%';
      });
    });
  }
}

export function renderSparsity(el, nFired, nKc) {
  if (!el) return;
  el.textContent = `${nFired} of ${nKc} Kenyon cells firing`;
}

export function renderRaster(canvas, fired, nKc) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#12141a';
  ctx.fillRect(0, 0, w, h);
  const on = new Uint8Array(nKc);
  for (let i = 0; i < fired.length; i++) on[fired[i]] = 1;
  for (let k = 0; k < nKc; k++) {
    const a = k * 2.399963229728653;
    const r = Math.sqrt(k / nKc);
    const x = (w * 0.5 + r * w * 0.46 * Math.cos(a)) | 0;
    const y = (h * 0.5 + r * h * 0.46 * Math.sin(a)) | 0;
    ctx.fillStyle = on[k] ? '#e39b3a' : '#2a313c';
    ctx.fillRect(x, y, 1, 1);
  }
}
