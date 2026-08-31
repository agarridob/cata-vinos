// ════════════════════════════════════════════════════════════════════════
// AVISO DE VOTO — banner grande + sonido al cambiar de vino (solo TV)
// La TV es la pantalla compartida a la que todos miran: cuando el anfitrión
// cambia de vino, avisamos aquí (visual + audio) para que la gente desbloquee
// el móvil y vote. No dependemos de notificaciones en el móvil (que no llegan
// con la pantalla bloqueada).
// ════════════════════════════════════════════════════════════════════════

// El aviso NO es un flash momentáneo: se queda un buen rato sobre el vino
// actual para dar tiempo a catar y votar (la gente mira la TV de vez en cuando).
const VOTE_ALERT_DURATION_MS = 15000;

// ── Audio: campanita generada con WebAudio (sin fichero externo) ──────────
// Los navegadores bloquean el autoplay hasta que hay un gesto del usuario.
// Creamos el AudioContext de forma perezosa y lo "desbloqueamos" con el primer
// clic/tecla/toque en la pantalla (en la TV suele bastar con entrar a pantalla
// completa, que ya es un clic).
let _voteAudioCtx = null;

function _getAudioCtx() {
  if (_voteAudioCtx) return _voteAudioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    _voteAudioCtx = new AC();
  } catch (e) {
    return null;
  }
  return _voteAudioCtx;
}

function _unlockVoteAudio() {
  const ctx = _getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}
['click', 'keydown', 'touchstart'].forEach((ev) =>
  document.addEventListener(ev, _unlockVoteAudio, { passive: true })
);

// Dos notas ascendentes tipo campana (mi5 → la5) con un poco de brillo.
function playVoteChime() {
  const ctx = _getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const notes = [
    { freq: 659.25, at: 0.0 },   // Mi5
    { freq: 880.0,  at: 0.14 },  // La5
  ];

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  // Volumen general suave, subida rápida y cola larga.
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

  notes.forEach(({ freq, at }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 1.3);
  });
}

// ── Banner visual ─────────────────────────────────────────────────────────
let _voteAlertHideTimer = null;

function triggerVoteAlert(wine, index, total) {
  showVoteAlertBanner(wine, index, total);
  playVoteChime();
}

function showVoteAlertBanner(wine, index, total) {
  let el = document.getElementById('vote-alert');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vote-alert';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }

  const type = (wine && wine.type) || '';
  const num = (typeof index === 'number' ? index + 1 : null);
  const headline = num ? `¡Hora de votar el Vino ${num}!` : '¡Hora de votar!';
  const name = (wine && wine.name) ? escapeHtml(wine.name) : '';

  el.dataset.wineType = type;
  el.innerHTML = `
    <div class="vote-alert-card">
      <div class="vote-alert-icon">🍷</div>
      <div class="vote-alert-text">
        <div class="vote-alert-headline">${headline}</div>
        ${name ? `<div class="vote-alert-name">${name}</div>` : ''}
        <div class="vote-alert-sub">📲 Abre la web en tu móvil y no te olvides de votar</div>
      </div>
    </div>`;

  // Reiniciar animación si ya estaba visible
  el.classList.remove('show');
  // Forzar reflow para reejecutar la transición
  void el.offsetWidth;
  el.classList.add('show');

  if (_voteAlertHideTimer) clearTimeout(_voteAlertHideTimer);
  _voteAlertHideTimer = setTimeout(() => {
    el.classList.remove('show');
  }, VOTE_ALERT_DURATION_MS);
}
