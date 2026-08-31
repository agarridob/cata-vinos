// ════════════════════════════════════════════════════════════════════════
// AVISO DE VOTO — banner + sonido en la TV (solo TV). La TV es la pantalla
// compartida a la que todos miran (los avisos en el móvil no llegan con la
// pantalla bloqueada). Flujo por vino:
//   • Al ENTRAR en un vino no sale nada (aún se está sirviendo/catando).
//   • A los 5 min aparece el recordatorio "¡Hora de votar el Vino X!" y se
//     queda.
//   • Al pulsar "siguiente", el servidor NO cambia al instante: abre una
//     "última llamada" de 30 s (payload.closing) durante la cual TV y móviles
//     siguen en el vino actual; aquí mostramos el banner con cuenta atrás.
//     Al expirar, el servidor cambia de verdad y empieza el ciclo del siguiente.
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
let _alertCountdownTimer = null;  // intervalo de la cuenta atrás (cierre)
let _alertWineIdx = null;         // vino que estamos "vigilando"
let _alertReminderDue = false;    // ya han pasado los 5 min de este vino
let _alertVisible = false;        // banner mostrándose ahora mismo

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
      showVoteAlert('reminder', wine, idx, total, 0);
    }, VOTE_REMINDER_DELAY_MS);
    hideVoteAlert();
  }

  if (payload.closing) {
    // Última llamada: banner con cuenta atrás (prioritario sobre el recordatorio).
    showVoteAlert('closing', wine, idx, total, payload.closing_seconds || 0);
  } else if (_alertReminderDue) {
    showVoteAlert('reminder', wine, idx, total, 0);
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
  if (el) { el.classList.remove('show', 'closing'); el.dataset.key = ''; }
  if (_alertCountdownTimer) { clearInterval(_alertCountdownTimer); _alertCountdownTimer = null; }
  _alertVisible = false;
}

// ── Banner visual ───────────────────────────────────────────────────────────
function showVoteAlert(mode, wine, index, total, seconds) {
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

  // Reconstruir el DOM solo cuando cambia el modo/vino o estaba oculto (así la
  // cuenta atrás no reinicia la animación de entrada en cada tick).
  const key = mode + '|' + index;
  if (el.dataset.key !== key || !_alertVisible) {
    const wasHidden = !_alertVisible;
    el.dataset.key = key;
    el.dataset.wineType = type;
    el.classList.toggle('closing', mode === 'closing');
    el.innerHTML = `
      <div class="vote-alert-card">
        <div class="vote-alert-icon">${mode === 'closing' ? '⏳' : '🍷'}</div>
        <div class="vote-alert-text">
          <div class="vote-alert-headline">${headline}</div>
          ${name ? `<div class="vote-alert-name">${name}</div>` : ''}
          <div class="vote-alert-sub"></div>
        </div>
      </div>`;
    if (wasHidden) {
      el.classList.remove('show');
      void el.offsetWidth;   // forzar reflow → reejecuta la transición de entrada
      el.classList.add('show');
      playVoteChime();
    } else {
      el.classList.add('show');
    }
    _alertVisible = true;
  }

  // Texto inferior (se actualiza sin reconstruir, para la cuenta atrás).
  const sub = el.querySelector('.vote-alert-sub');
  if (sub) {
    if (mode === 'closing') {
      const s = Math.max(0, seconds);
      sub.innerHTML = `Cambiamos de vino en <span class="vote-alert-count">${s}s</span> · ¡vota ya desde el móvil!`;
    } else {
      sub.textContent = '📲 Abre la web en tu móvil y no te olvides de votar';
    }
  }

  // Cuenta atrás local solo en modo cierre. El servidor reenvía closing_seconds
  // en cada broadcast (votos, etc.), así que resincronizamos el arranque.
  if (mode === 'closing') {
    if (_alertCountdownTimer) clearInterval(_alertCountdownTimer);
    let remaining = Math.max(0, seconds);
    _alertCountdownTimer = setInterval(() => {
      remaining -= 1;
      const s = el.querySelector('.vote-alert-count');
      if (s && remaining >= 0) s.textContent = remaining + 's';
      if (remaining <= 0) { clearInterval(_alertCountdownTimer); _alertCountdownTimer = null; }
    }, 1000);
  } else if (_alertCountdownTimer) {
    clearInterval(_alertCountdownTimer);
    _alertCountdownTimer = null;
  }
}
