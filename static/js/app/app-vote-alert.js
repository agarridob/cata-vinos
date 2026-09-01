// ════════════════════════════════════════════════════════════════════════
// AVISO DE VOTO — banner + sonido en la TV (solo TV). La TV es la pantalla
// compartida a la que todos miran (los avisos en el móvil no llegan con la
// pantalla bloqueada). El banner "¡Hora de votar el Vino X!" aparece:
//   • Automáticamente a los 5 min de entrar en el vino, y se oculta al minuto.
//   • Manualmente al pulsar "lanzar aviso" en el panel (payload.alert_nonce);
//     se oculta a los 30 s.
//   • Se puede quitar a mano con "quitar popup" (payload.alert_hide_nonce).
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

// El banner se oculta solo pasado un rato: el recordatorio automático dura más;
// el aviso manual es un empujón puntual y dura menos.
const VOTE_AUTO_HIDE_MS = 60 * 1000;    // recordatorio de 5 min → 1 min visible
const VOTE_MANUAL_HIDE_MS = 30 * 1000;  // aviso manual del panel → 30 s visible

// ── Estado interno ──────────────────────────────────────────────────────────
let _alertReminderTimer = null;   // temporizador de los 5 min (auto)
let _alertHideTimer = null;       // temporizador de auto-ocultado del banner
let _alertWineIdx = null;         // vino que estamos "vigilando"
let _alertVisible = false;        // banner mostrándose ahora mismo
let _alertWine = null;            // ficha del vino actual (para el trigger diferido)
let _alertTotal = 0;
let _alertLastNonce = null;       // último alert_nonce visto (botón "lanzar aviso")
let _alertLastHideNonce = null;   // último alert_hide_nonce visto (botón "quitar popup")

// Punto de entrada único: se llama en cada update del servidor (solo TV).
// Modelo por eventos: el banner solo se muestra en momentos concretos (a los
// 5 min, o al pulsar el botón) y se oculta solo; NO se re-muestra en cada
// update, así que una vez oculto se queda oculto.
function syncVoteAlert(payload) {
  const onWine = payload && !payload.is_welcome && !payload.is_summary
    && payload.all_wines && payload.all_wines[payload.index];

  if (isMobile() || !onWine) {
    resetVoteAlert();
    return;
  }

  const idx = payload.index;
  _alertWine = payload.all_wines[idx];
  _alertTotal = payload.total;

  // ¿Vino nuevo? Reiniciar (sin banner) y armar el recordatorio de 5 min.
  // En modo duelo NO se arma el auto-aviso: solo avisos manuales desde el panel.
  if (idx !== _alertWineIdx) {
    _alertWineIdx = idx;
    clearAlertTimers();
    hideVoteAlert();
    if (payload.mode !== 'duelo') {
      _alertReminderTimer = setTimeout(() => triggerVoteAlert('auto'), VOTE_REMINDER_DELAY_MS);
    }
  }

  // Botón "lanzar aviso": el servidor incrementa alert_nonce. Al verlo subir,
  // mostramos el banner ya.
  const nonce = payload.alert_nonce;
  if (typeof nonce === 'number') {
    if (_alertLastNonce !== null && nonce > _alertLastNonce) triggerVoteAlert('manual');
    _alertLastNonce = nonce;
  }

  // Botón "quitar popup": el servidor incrementa alert_hide_nonce. Al verlo
  // subir, ocultamos el banner (y dejamos de recordar automáticamente en este
  // vino, para que "quitar" signifique de verdad quitar).
  const hideNonce = payload.alert_hide_nonce;
  if (typeof hideNonce === 'number') {
    if (_alertLastHideNonce !== null && hideNonce > _alertLastHideNonce) {
      clearAlertTimers();
      hideVoteAlert();
    }
    _alertLastHideNonce = hideNonce;
  }
}

// Muestra el banner y programa su auto-ocultado según el origen.
function triggerVoteAlert(source) {
  const hideMs = source === 'manual' ? VOTE_MANUAL_HIDE_MS : VOTE_AUTO_HIDE_MS;
  showVoteAlert(_alertWine, _alertWineIdx, _alertTotal, source === 'manual');
  if (_alertHideTimer) clearTimeout(_alertHideTimer);
  _alertHideTimer = setTimeout(() => hideVoteAlert(), hideMs);
}

function clearAlertTimers() {
  if (_alertReminderTimer) { clearTimeout(_alertReminderTimer); _alertReminderTimer = null; }
  if (_alertHideTimer) { clearTimeout(_alertHideTimer); _alertHideTimer = null; }
}

// Reset total (al salir a bienvenida/resumen, o en móvil).
function resetVoteAlert() {
  _alertWineIdx = null;
  clearAlertTimers();
  hideVoteAlert();
}

function hideVoteAlert() {
  const el = document.getElementById('vote-alert');
  if (el) { el.classList.remove('show'); el.dataset.key = ''; }
  _alertVisible = false;
}

// ════════════════════════════════════════════════════════════════════════
// AVISO DE PREFERENCIA ¿Viejo o Nuevo? (modo duelo)
// Lo dispara el anfitrión con "⚔️ Lanzar ¿Viejo o Nuevo?" → sube pref_alert_nonce.
// En la TV muestra un banner ~30 s con campanita. En el móvil resalta el toggle
// de preferencia (delega en highlightPairVote de app-voting.js).
// ════════════════════════════════════════════════════════════════════════
const PREF_ALERT_HIDE_MS = 30 * 1000;
let _prefLastNonce = null;
let _prefLastHideNonce = null;
let _prefHideTimer = null;

function syncPrefAlert(payload) {
  if (!payload || payload.mode !== 'duelo') {
    // Fuera de modo duelo: solo mantener el baseline del nonce (sin disparar).
    if (payload && typeof payload.pref_alert_nonce === 'number') {
      _prefLastNonce = payload.pref_alert_nonce;
    }
    hidePrefAlert();
    return;
  }

  // Botón "quitar popup" también oculta el banner de preferencia en la TV.
  const hideNonce = payload.alert_hide_nonce;
  if (typeof hideNonce === 'number') {
    if (_prefLastHideNonce !== null && hideNonce > _prefLastHideNonce) hidePrefAlert();
    _prefLastHideNonce = hideNonce;
  }

  const nonce = payload.pref_alert_nonce;
  if (typeof nonce !== 'number') return;
  const bumped = _prefLastNonce !== null && nonce > _prefLastNonce;
  _prefLastNonce = nonce;
  if (!bumped) return;

  if (isMobile()) {
    // En el móvil, el toggle vive en la vista de vino; app-voting lo resalta.
    if (typeof highlightPairVote === 'function') highlightPairVote();
    return;
  }

  showPrefAlert();
  if (_prefHideTimer) clearTimeout(_prefHideTimer);
  _prefHideTimer = setTimeout(hidePrefAlert, PREF_ALERT_HIDE_MS);
}

function showPrefAlert() {
  let el = document.getElementById('pref-alert');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pref-alert';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="vote-alert-card pref-alert-card">
      <div class="vote-alert-icon">⚔️</div>
      <div class="vote-alert-text">
        <div class="vote-alert-headline">¡Vota tu favorito!</div>
        <div class="vote-alert-name">🌍 ¿Viejo o Nuevo Mundo? 🌎</div>
        <div class="vote-alert-sub">📲 Elige en tu móvil cuál te ha gustado más</div>
      </div>
    </div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  playVoteChime();
}

function hidePrefAlert() {
  const el = document.getElementById('pref-alert');
  if (el) el.classList.remove('show');
  if (_prefHideTimer) { clearTimeout(_prefHideTimer); _prefHideTimer = null; }
}

// ── Banner visual ───────────────────────────────────────────────────────────
function showVoteAlert(wine, index, total, force) {
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

  // Reconstruir/animar cuando cambia el vino, estaba oculto, o se fuerza (aviso
  // manual repetido): así el botón siempre "llama la atención" (reanima + suena).
  const key = 'wine|' + index;
  if (el.dataset.key !== key || !_alertVisible || force) {
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
