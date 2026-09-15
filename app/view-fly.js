export function mountFly(el) {
  el.innerHTML = `
    <svg class="fly-svg" viewBox="0 0 120 80" role="img" aria-label="A fruit fly at the table">
      <ellipse class="body" cx="58" cy="42" rx="22" ry="12"/>
      <ellipse class="thorax" cx="38" cy="40" rx="10" ry="9"/>
      <circle class="head" cx="24" cy="38" r="8"/>
      <ellipse class="eye" cx="20" cy="36" rx="3.2" ry="2.6"/>
      <path class="ant" d="M18 32 C12 22, 8 18, 6 14"/>
      <path class="ant" d="M22 31 C20 20, 22 14, 24 10"/>
      <path class="wing" d="M48 34 C70 8, 100 12, 96 28 C84 22, 62 28, 48 36"/>
      <path class="leg front" d="M34 48 L18 66"/>
      <path class="leg" d="M42 50 L36 70"/>
      <path class="leg" d="M50 51 L54 72"/>
    </svg>
    <p class="fly-cap">Idle. It will push chips when it acts.</p>
  `;
}

export function setFlyState(el, kind) {
  const cap = el.querySelector('.fly-cap');
  const svg = el.querySelector('.fly-svg');
  if (svg) svg.dataset.state = kind;
  if (!cap) return;
  const text = {
    idle: 'Grooming. Waiting on you.',
    decide: 'Antennae up. Weighing the four actions.',
    raise: 'Walking in. Pushing chips with a front leg.',
    allin: 'A heavier shove. The stack goes in.',
    win: 'A drop of sugar.',
    lose: 'A short sulk, then the next hand.',
  }[kind] || 'At the table.';
  cap.textContent = text;
}
