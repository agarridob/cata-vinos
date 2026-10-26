// ════════════════════════════════════════════════════════════════════════
// CORE — estado global compartido, isMobile, SSE, renderCurrent, navegación
// Carga: 1º. Declara el estado que el resto de módulos comparten.
// ════════════════════════════════════════════════════════════════════════

const root = document.getElementById('root');
let currentSig = null;

// ── Navegación local (móvil): el invitado puede retroceder pero no adelantarse al anfitrión ──
let serverState = null;
let localIndex = null;
let initialized = false;
const isMobile = () => window.innerWidth <= 900;

// Tipo de vino → etiqueta del chip de color en la ficha (espumoso lleva copa)
const WINE_TYPE_LABELS = {
  tinto: 'Tinto',
  clarete: 'Clarete',
  blanco: 'Blanco',
  rosado: 'Rosado',
  orange: 'Orange',
  espumoso: '🥂 Espumoso',
};

let lastIsMobile = isMobile();

window.addEventListener('resize', () => {
  const nowIsMobile = isMobile();

  if (nowIsMobile !== lastIsMobile) {
    lastIsMobile = nowIsMobile;

    // Forzar reconstrucción porque cambia la estrategia de mapa:
    // desktop = SVG, móvil = Leaflet.
    currentSig = null;

    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }

    renderCurrent();
  }
});

function onServerUpdate(payload) {
  const prevServerIdx = serverState
    ? (serverState.is_summary ? serverState.total : serverState.index)
    : null;

  serverState = payload;

  // ── Detección de expulsión en vivo ──
  // Si el admin me ha borrado desde el control, el servidor deja de incluirme
  // en users_public. Lo detectamos aquí (llega por el SSE) y forzamos el
  // re-registro sin que el invitado tenga que recargar el móvil.
  if (myUser && payload.users_public && !payload.users_public[myUser.user_id]) {
    myUser = null;
    localStorage.removeItem(STORAGE_KEY);
    refreshVoteUI();
    showOnboarding('first');
  }

  const serverIdx = payload.is_summary ? payload.total : payload.index;

  if (!initialized) {
    localIndex = serverIdx;
    initialized = true;
  } else if (prevServerIdx !== serverIdx) {
    // El anfitrión cambió de vino. Si el invitado está escribiendo un comentario
    // en el móvil, NO le arrancamos de la pantalla: le dejamos terminar. En
    // cualquier otro caso, seguimos al anfitrión.
    if (isMobile() && isComposingComment()) {
      // no tocamos localIndex: se queda donde escribe (updateCatchupBanner avisa)
    } else {
      localIndex = serverIdx;
    }
  } else if (isMobile() && localIndex > serverIdx) {
    // Por si acaso: no permitir quedar adelantado
    localIndex = serverIdx;
  }
  // Si el server NO cambió, respetar la navegación manual local (móvil)

  renderCurrent();

  // Aviso "ponte al día": se muestra siempre que el móvil vaya por detrás del
  // anfitrión (escribiendo comentario, navegación manual hacia atrás, o SSE que
  // se quedó atrás tras bloquear/reabrir). Un toque y salta al vino actual.
  updateCatchupBanner();

  // Aviso de voto en la TV (recordatorio a los 5 min + última llamada de 30 s).
  // Gestiona sus propios temporizadores; se le pasa cada update.
  syncVoteAlert(payload);

  // Aviso de preferencia ¿Viejo o Nuevo? (modo duelo). TV: banner; móvil: resalta
  // el toggle. Gestiona su propio nonce/baseline.
  syncPrefAlert(payload);

  // Popups de votos en TV (solo en vista de vino)
  if (!isMobile() && !payload.is_summary && !payload.is_welcome && payload.current_wine_votes) {
    detectVoteChanges(payload.index, payload.current_wine_votes, payload.users_public || {});
  } else {
    // Reset el cache si no estamos en vista de vino
    lastVotesByUser = {};
    lastVotesForWineIdx = null;
  }
}

// Renderiza una puntuación 0..5 (admite medias, p.ej. 3.5) como 5 estrellas con
// relleno parcial. Devuelve HTML: cada estrella es un glyph ★ en color "vacío"
// con una capa ★ dorada recortada por ancho (0–100%). Así una nota de 3.5 pinta
// 3 estrellas llenas y media. Sustituye a los bucles antiguos de '★'/'☆'.
function starsHtml(value) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  let html = '';
  for (let i = 0; i < 5; i++) {
    const pct = Math.max(0, Math.min(1, v - i)) * 100;
    html += '<span class="star">★<span class="star-fill" style="width:' + pct + '%">★</span></span>';
  }
  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Parsea un rating de expertos en pares {sys, sco}. Admite varios separados
// por "·", p.ej. "Suckling 95 · Parker 92+" → [{sys:Suckling,sco:95},{sys:Parker,sco:92+}].
// Solo se usa como compatibilidad con el formato antiguo (rating string). Los vinos
// nuevos traen wine.ratings = [{name, score}] y no dependen de este heurístico.
function parseRatingPairs(rating) {
  if (!rating || !String(rating).trim()) return [];
  return String(rating).split('·').map(s => s.trim()).filter(Boolean).map(seg => {
    const m = seg.match(/^(\S+)\s+(.+)$/);
    return m ? { sys: m[1], sco: m[2] } : { sys: '', sco: seg };
  });
}

// Devuelve las puntuaciones de un vino como pares {sys, sco} para render.
// Prefiere el formato nuevo wine.ratings = [{name, score}]; si no existe, cae al
// string legacy wine.rating (parseado con el heurístico antiguo).
function wineRatingPairs(wine) {
  if (wine && Array.isArray(wine.ratings)) {
    return wine.ratings
      .map(r => ({ sys: String((r && r.name) || '').trim(), sco: String((r && r.score) || '').trim() }))
      .filter(r => r.sys || r.sco);
  }
  return parseRatingPairs(wine && wine.rating);
}

function renderEmpty(sessionName) {
  root.innerHTML = `
    <div class="empty-state">
      <h1>Las catas de Mariana</h1>
      <p>${sessionName ? sessionName + ' · ' : ''}Esperando vinos…</p>
    </div>`;
  currentSig = '__empty__';
}

function navigateTo(idx) {
  if (!serverState) return;
  const serverIdx = serverState.is_summary ? serverState.total : serverState.index;
  if (idx < 0 || idx > serverIdx) return;  // no se puede ir adelante del server
  if (idx === localIndex) return;
  // No enviamos comentarios automáticamente al navegar: solo se guardan como borrador local.
  localIndex = idx;
  currentSig = null;  // forzar rerender (sin animación)
  renderCurrent();
  updateCatchupBanner();   // navegación manual hacia atrás → avisa que vas por detrás
}
window.navigateTo = navigateTo;

// ── Aviso "ponte al día" (móvil) ─────────────────────────────────────────────
// Se muestra siempre que el móvil va por DETRÁS del anfitrión: escribiendo un
// comentario (no le cambiamos la pantalla), navegando manualmente hacia atrás, o
// tras bloquear/reabrir el navegador y quedarse en un vino anterior. Un toque en
// el aviso salta al vino actual. catchupIdx = índice pendiente del server (o null).
let catchupIdx = null;

// ¿El invitado está redactando un comentario ahora mismo? (textarea con foco)
function isComposingComment() {
  const el = document.getElementById('vote-comment');
  return !!el && document.activeElement === el;
}

// Muestra u oculta el aviso según si el móvil va por detrás del anfitrión.
// Fuente única de verdad: se llama tras cada update del server y cada navegación.
function updateCatchupBanner() {
  if (!serverState || !isMobile() || serverState.is_welcome || localIndex === null) {
    hideCatchupBanner();
    return;
  }
  const serverIdx = serverState.is_summary ? serverState.total : serverState.index;
  if (localIndex < serverIdx) showCatchupBanner(serverIdx);
  else hideCatchupBanner();
}

function showCatchupBanner(idx) {
  catchupIdx = idx;
  let b = document.getElementById('catchup-banner');
  if (!b) {
    b = document.createElement('button');
    b.id = 'catchup-banner';
    b.type = 'button';
    b.className = 'catchup-banner';
    b.addEventListener('click', catchUpToServer);
    document.body.appendChild(b);
  }
  const isSummary = serverState && serverState.is_summary && idx === serverState.total;
  const html = isSummary
    ? '📊 El anfitrión ha pasado al <strong>resumen</strong> · toca para verlo'
    : `🍷 El anfitrión ya sirve el <strong>Vino ${idx + 1}</strong> · toca para ir`;
  if (b.innerHTML !== html) b.innerHTML = html;   // evita repintar en cada SSE
  b.classList.add('visible');
}

function hideCatchupBanner() {
  catchupIdx = null;
  const b = document.getElementById('catchup-banner');
  if (b) b.classList.remove('visible');
}

// Salta al vino que sirve ahora el anfitrión y cierra el aviso.
function catchUpToServer() {
  if (!serverState) return;
  const serverIdx = serverState.is_summary ? serverState.total : serverState.index;
  hideCatchupBanner();
  const cEl = document.getElementById('vote-comment');
  if (cEl) cEl.blur();
  navigateTo(serverIdx);
}
window.catchUpToServer = catchUpToServer;

function renderCurrent() {
  if (!serverState) return;

  const total = serverState.total;
  const serverIdx = serverState.is_summary ? total : serverState.index;

  if (!serverState.all_wines || total === 0) {
    renderEmpty(serverState.session);
    return;
  }

  // Vista bienvenida (antes de empezar la cata)
  if (serverState.is_welcome) {
    // Fingerprint de usuarios registrados para re-renderizar cuando llega alguien nuevo
    const usersFingerprint = Object.entries(serverState.users_public || {})
      .map(([uid, u]) => `${uid}:${u.name}:${u.color}`)
      .sort()
      .join('|');
    const sig = `__welcome__|${serverState.session}|${myUser ? myUser.user_id : 'anon'}|${usersFingerprint}`;
    if (sig === currentSig) return;
    currentSig = sig;
    stopHighlightsRotation();
    document.body.classList.add('welcome-active');
    renderWelcome(serverState);
    return;
  }
  document.body.classList.remove('welcome-active');

  // Vista resumen
  const isSummaryView = serverState.is_summary && localIndex === total;

  if (isSummaryView) {
    ensureSummaryViewTimer();

    const summaryView = getCurrentSummaryView();

    // Incluir fingerprint de votos y vista actual.
    const votesFingerprint =
      JSON.stringify(serverState.votes_summary || {}) +
      '|' +
      (serverState.highlights ? serverState.highlights.length : 0) +
      '|' +
      JSON.stringify(serverState.personal_favorites || {}) +
      '|' +
      JSON.stringify(serverState.pair_votes_summary || {});

    const sig = `__summary__|${summaryView}|${total}|${votesFingerprint}|${serverState.summary_auto}|${serverState.summary_view}`;

    if (sig === currentSig) return;
    currentSig = sig;

    const summaryPayload = {
      session: serverState.session,
      total: total,
      all_wines: serverState.all_wines,
      _serverIdx: serverIdx,
      votes_summary: serverState.votes_summary || {},
      highlights: serverState.highlights || [],
      personal_favorites: serverState.personal_favorites || {},
      users_public: serverState.users_public || {},
      mode: serverState.mode,
      pair_votes_summary: serverState.pair_votes_summary || null,
    };

    if (summaryView === 'journey') {
      renderSummaryJourney(summaryPayload);
    } else {
      renderSummary(summaryPayload);
    }

    return;
  }

  // Vista vino individual — paramos la rotación de destacados si la había
  stopHighlightsRotation();
  const wine = serverState.all_wines[localIndex];
  if (!wine) return;

  // ── Modo duelo (SOLO TV): una pantalla por uva con los dos vinos enfrentados ──
  // El móvil sigue con la vista de vino individual (voto secuencial), así que
  // solo desviamos cuando NO es móvil.
  if (serverState.mode === 'duelo' && !isMobile()) {
    const pairIdx = Math.floor(localIndex / 2);
    const prefSig = JSON.stringify(serverState.pair_votes_summary || {});
    const sig = `__duel__|${pairIdx}|${serverState.index}|${prefSig}`;
    if (sig === currentSig) return;
    currentSig = sig;
    const ok = renderDuel({
      session: serverState.session,
      all_wines: serverState.all_wines,
      index: serverState.index,
      total: serverState.total,
      _serverIdx: serverState.is_summary ? serverState.total : serverState.index,
      pair_votes_summary: serverState.pair_votes_summary,
    }, pairIdx);
    if (ok) return;
    // Si no se pudo (pareja incompleta), caemos a la vista de vino de siempre.
  }

  ensureLayout();

  const sig = `${localIndex}|${wine.name}|${wine.winery}|${wine.vintage}`;
  if (sig === currentSig) return;
  const wasEmptyOrSummary = currentSig === null
    || currentSig === '__empty__'
    || (typeof currentSig === 'string' && currentSig.startsWith('__summary__'));
  currentSig = sig;

  const localPayload = {
    session: serverState.session,
    wine: wine,
    index: localIndex,
    total: total,
    _serverIdx: serverIdx,
  };

  if (wasEmptyOrSummary) {
    if (!root.querySelector('.tv-frame')) {
      root.innerHTML = '';
      ensureLayout();
    }
    applyUpdate(localPayload);
    // Al entrar desde bienvenida/resumen no pasamos por el fade de abajo, así que
    // hay que hacer visible el mapa aquí o se queda en opacity:0 (bug: mapa invisible).
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) mapContainer.classList.add('visible');
    return;
  }

  const bottleArea = document.getElementById('bottle-area');
  const infoArea = document.getElementById('info-area');
  const mapContainer = document.querySelector('.map-container');

  bottleArea.classList.add('fade-out');
  infoArea.classList.add('fade-out');
  if (mapContainer) mapContainer.classList.remove('visible');

  setTimeout(() => {
    applyUpdate(localPayload);

    bottleArea.classList.remove('fade-out');
    infoArea.classList.remove('fade-out');

    if (mapContainer) {
      // pequeño delay para que el render ocurra antes del fade-in
      mapContainer.style.transform = 'scale(0.98)';
      setTimeout(() => {
        mapContainer.classList.add('visible');
        mapContainer.style.transform = 'scale(1)';
      }, 50);
    }

  }, 400);
}

function connect() {
  const es = new EventSource('/stream');
  es.onmessage = (e) => {
    try {
      onServerUpdate(JSON.parse(e.data));
    } catch (err) {
      console.error('Parse error', err);
    }
  };
  es.onerror = () => {
    console.warn('SSE error, reconectando en 3s...');
    es.close();
    setTimeout(connect, 3000);
  };
}

// Primera conexión con un pequeño retardo aleatorio para esparcir el pico
// cuando muchos invitados abren la página a la vez (evita saturar el servidor).
// Antes de conectar al stream, cargamos los mapas externos.
async function initApp() {
  await loadMapsData();
  setTimeout(connect, Math.random() * 1200);
}
