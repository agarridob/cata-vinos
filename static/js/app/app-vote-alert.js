// ════════════════════════════════════════════════════════════════════════
// AVISO DE VOTO — banner + sonido en la TV (solo TV). La TV es la pantalla
// compartida a la que todos miran (los avisos en el móvil no llegan con la
// pantalla bloqueada). El banner "¡Hora de votar el Vino X!" aparece:
//   • Automáticamente a los 5 min de entrar en el vino, y se queda.
//   • Manualmente cuando el anfitrión pulsa el botón del panel (el servidor
//     incrementa payload.alert_nonce y la TV reacciona al verlo subir).
// Al ENTRAR en un vino no sale nada (aún se está sirviendo/catando) y el
// cambio de vino es instantáneo, sin esperas.
// ════════════════════════════════════════════════════════════════════════

// Retardo del recordatorio automático tras entrar en un vino. Se puede ajustar
// (o acelerar en pruebas) con window.__VOTE_REMINDER_MS__ antes de cargar.
const VOTE_REMINDER_DELAY_MS =
  (typeof window !== 'undefined' && window.__VOTE_REMINDER_MS__) || 5 * 60 * 1000;

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

// ── Estado interno ──────────────────────────────────────────────────────────
let _alertReminderTimer = null;   // temporizador de los 5 min
let _alertWineIdx = null;         // vino que estamos "vigilando"
let _alertReminderDue = false;    // ya toca mostrar el aviso de este vino (5 min o manual)
let _alertVisible = false;        // banner mostrándose ahora mismo
let _alertLastNonce = null;       // último alert_nonce visto (aviso manual del panel)

// Punto de entrada único: se llama en cada update del servidor (solo TV).
function syncVoteAlert(payload) {
  const onWine = payload && !payload.is_welcome && !payload.is_summary
    && payload.all_wines && payload.all_wines[payload.index];

  if (isMobile() || !onWine) {
    resetVoteAlert();
    return;
  }

  const idx = payload.index;
  const wine = payload.all_wines[idx];
  const total = payload.total;

  // ¿Vino nuevo? Reiniciar: sin banner y arrancar el temporizador de 5 min.
  if (idx !== _alertWineIdx) {
    _alertWineIdx = idx;
    _alertReminderDue = false;
    if (_alertReminderTimer) clearTimeout(_alertReminderTimer);
    _alertReminderTimer = setTimeout(() => {
      _alertReminderDue = true;
      showVoteAlert(wine, idx, total);
    }, VOTE_REMINDER_DELAY_MS);
    hideVoteAlert();
  }

  // Aviso manual desde el panel: el servidor incrementa alert_nonce. Al ver un
  // valor mayor que el último, mostramos el banner ya (como el recordatorio).
  const nonce = payload.alert_nonce;
  if (typeof nonce === 'number') {
    if (_alertLastNonce !== null && nonce > _alertLastNonce) {
      _alertReminderDue = true;
    }
    _alertLastNonce = nonce;
  }

  if (_alertReminderDue) {
    showVoteAlert(wine, idx, total);
  } else {
    hideVoteAlert();
  }
}

// Reset total (al salir a bienvenida/resumen, o en móvil).
function resetVoteAlert() {
  _alertWineIdx = null;
  _alertReminderDue = false;
  if (_alertReminderTimer) { clearTimeout(_alertReminderTimer); _alertReminderTimer = null; }
  hideVoteAlert();
}

function hideVoteAlert() {
  const el = document.getElementById('vote-alert');
  if (el) { el.classList.remove('show'); el.dataset.key = ''; }
  _alertVisible = false;
}

// ── Banner visual ───────────────────────────────────────────────────────────
function showVoteAlert(wine, index, total) {
  let el = document.getElementById('vote-alert');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vote-alert';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }

  const num = (typeof index === 'number' ? index + 1 : null);
  const headline = num ? `¡Hora de votar el Vino ${num}!` : '¡Hora de votar!';
  const name = (wine && wine.name) ? escapeHtml(wine.name) : '';
  const type = (wine && wine.type) || '';

  // Reconstruir solo cuando cambia el vino o estaba oculto (no en cada update).
  const key = 'wine|' + index;
  if (el.dataset.key !== key || !_alertVisible) {
    el.dataset.key = key;
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
    el.classList.remove('show');
    void el.offsetWidth;   // forzar reflow → reejecuta la transición de entrada
    el.classList.add('show');
    playVoteChime();
    _alertVisible = true;
  }
}
