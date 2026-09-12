// ════════════════════════════════════════════════════════════════════════
// VOTACIÓN — identidad, onboarding, voto, borradores (móvil) + BOOTSTRAP
// Carga: ÚLTIMO. Contiene el monkey-patch de renderCurrent/onServerUpdate
// y la llamada initApp() que arranca la app.
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// SISTEMA DE VOTACIÓN — identidad, onboarding y voto
// ════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'cata_user';
const CLIENT_ID_KEY = 'cata_client_id';

// Id estable del dispositivo, generado UNA vez y persistido ANTES del primer
// POST. Hace idempotente el alta: si la petición se reintenta, el servidor
// reconoce el mismo id y devuelve el usuario ya creado, sin duplicar.
function getClientId() {
  let cid = null;
  try { cid = localStorage.getItem(CLIENT_ID_KEY); } catch (e) {}
  if (!cid) {
    cid = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'cid-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    try { localStorage.setItem(CLIENT_ID_KEY, cid); } catch (e) {}
  }
  return cid;
}

// Identidad local: { user_id, name, color }
let myUser = null;
function loadMyUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) myUser = JSON.parse(raw);
  } catch (e) { myUser = null; }
}
function saveMyUser() {
  try {
    if (myUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(myUser));
  } catch (e) {}
}
loadMyUser();

// ── Modal de onboarding ──
const modalEl       = document.getElementById('onboarding');
const colorGridEl   = document.getElementById('onboard-color-grid');
const colorHintEl   = document.getElementById('onboard-color-hint');
const nameInputEl   = document.getElementById('onboard-name');
const submitBtnEl   = document.getElementById('onboard-submit');
const cancelBtnEl   = document.getElementById('onboard-cancel');
const errorEl       = document.getElementById('onboard-error');
const eyebrowEl     = document.getElementById('onboard-eyebrow');
const introEl      = document.getElementById('onboard-intro');

let onboardingMode = 'first';   // 'first' o 'edit'
let onboardingSelectedColor = null;
let onboardingColors = [];       // [{key, name, hex, taken}]
let onboardingOnDone = null;     // callback al cerrar

async function fetchColors() {
  try {
    const r = await fetchWithRetry('/api/colors', { cache: 'no-store' }, 3);
    onboardingColors = await r.json();
  } catch (e) {
    console.error('No se pueden cargar colores', e);
    onboardingColors = [];
  }
}

// fetch con reintentos + backoff exponencial y jitter.
// Reintenta ante fallo de red o respuesta 5xx; los 4xx se devuelven tal cual.
async function fetchWithRetry(url, opts = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status >= 500) throw new Error('server_' + r.status);
      return r;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) {
        const wait = 300 * Math.pow(2, i) + Math.random() * 400;
        await new Promise(res => setTimeout(res, wait));
      }
    }
  }
  throw lastErr;
}

function renderColorGrid() {
  colorGridEl.innerHTML = '';
  onboardingColors.forEach(c => {
    const d = document.createElement('div');
    d.className = 'modal-color';
    d.style.background = c.hex;
    d.title = c.name;
    d.dataset.key = c.key;
    // En modo edición, el propio color no es "taken"
    const isMine = (onboardingMode === 'edit' && myUser && myUser.color === c.key);
    if (c.taken && !isMine) d.classList.add('taken');
    if (onboardingSelectedColor === c.key) d.classList.add('selected');
    if (!c.taken || isMine) {
      d.onclick = () => {
        onboardingSelectedColor = c.key;
        renderColorGrid();
        const found = onboardingColors.find(x => x.key === c.key);
        colorHintEl.textContent = found ? `Tu copa: ${found.name}` : '';
        validateSubmit();
      };
    }
    colorGridEl.appendChild(d);
  });
  // Recordatorio si no hay seleccionado todavía
  if (!onboardingSelectedColor) {
    colorHintEl.textContent = 'Toca un color para empezar';
  }
}

function validateSubmit() {
  submitBtnEl.disabled = !onboardingSelectedColor;
}

async function showOnboarding(mode, onDone) {
  onboardingMode = mode;
  onboardingOnDone = onDone || null;
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
  await fetchColors();
  if (mode === 'edit' && myUser) {
    eyebrowEl.textContent = 'Editar mi ficha';
    introEl.innerHTML = 'Cambia tu <strong>color</strong> o <strong>nombre</strong>.';
    onboardingSelectedColor = myUser.color;
    nameInputEl.value = myUser.name || '';
    submitBtnEl.textContent = 'Guardar';
    cancelBtnEl.style.display = '';
  } else {
    eyebrowEl.textContent = 'Bienvenido a';
    introEl.innerHTML = 'Identifícate para votar los vinos.<br>Tu <strong>color</strong> es el marcador de tu copa.';
    // Por defecto, un color libre AL AZAR. Pre-seleccionar el primero libre
    // hacía que, al empezar todos a la vez, casi todos cayeran en el de arriba
    // de la lista (rojo) y colisionaran. Repartir el azar reduce los choques.
    const freeColors = onboardingColors.filter(c => !c.taken);
    onboardingSelectedColor = freeColors.length
        ? freeColors[Math.floor(Math.random() * freeColors.length)].key
        : null;
    nameInputEl.value = '';
    submitBtnEl.textContent = 'Empezar a votar';
    cancelBtnEl.style.display = 'none';
  }
  renderColorGrid();
  validateSubmit();
  modalEl.classList.add('visible');
}

function hideOnboarding() {
  modalEl.classList.remove('visible');
  onboardingOnDone = null;
}

cancelBtnEl.addEventListener('click', () => {
  hideOnboarding();
});

document.getElementById('onboard-close').addEventListener('click', () => {
  // Si estábamos a punto de votar (modo first sin myUser), limpiar las estrellas iluminadas
  if (onboardingMode === 'first' && !myUser) {
    myVoteScore = null;
    applyVoteToStars();
  }
  hideOnboarding();
});

submitBtnEl.addEventListener('click', async () => {
  if (!onboardingSelectedColor) return;
  errorEl.classList.add('hidden');
  const name = nameInputEl.value.trim();
  submitBtnEl.disabled = true;
  try {
    if (onboardingMode === 'edit' && myUser) {
      const r = await fetchWithRetry('/api/me/' + encodeURIComponent(myUser.user_id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, color: onboardingSelectedColor }),
      }, 3);
      if (r.status === 409) {
        errorEl.textContent = 'Ese color lo cogió otro invitado. Elige otro.';
        errorEl.classList.remove('hidden');
        await fetchColors();
        renderColorGrid();
        submitBtnEl.disabled = false;
        return;
      }
      if (!r.ok) throw new Error('PATCH failed');
      const u = await r.json();
      myUser.name = u.name;
      myUser.color = u.color;
      saveMyUser();
    } else {
      const r = await fetchWithRetry('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: getClientId(),          // ← idempotencia
          name: name,
          color: onboardingSelectedColor,
        }),
      }, 3);
      if (r.status === 409) {              // ← coherente con el PATCH
        errorEl.textContent = 'Ese color lo cogió otro invitado. Elige otro.';
        errorEl.classList.remove('hidden');
        await fetchColors();
        renderColorGrid();
        submitBtnEl.disabled = false;
        return;
      }
      if (!r.ok) throw new Error('POST failed');
      const u = await r.json();
      myUser = { user_id: u.user_id, name: u.name, color: u.color };
      saveMyUser();
    }
    refreshVoteUI();
    const cb = onboardingOnDone;
    hideOnboarding();
    if (cb) cb();
  } catch (e) {
    errorEl.textContent = 'No se pudo guardar. Inténtalo de nuevo.';
    errorEl.classList.remove('hidden');
  } finally {
    submitBtnEl.disabled = false;
  }
});

// ── Bloque de votación ──
let myVoteScore = null;       // 0..5 ó null
let myVoteComment = '';
let commentPendingText = null; // borrador local no enviado del vino actual
const COMMENT_DRAFTS_KEY = STORAGE_KEY + '_comment_drafts';

function loadCommentDrafts() {
  try {
    return JSON.parse(localStorage.getItem(COMMENT_DRAFTS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveCommentDrafts(drafts) {
  try {
    localStorage.setItem(COMMENT_DRAFTS_KEY, JSON.stringify(drafts || {}));
  } catch (e) {}
}

function commentDraftKey(idx = localIndex) {
  if (!myUser || !myUser.user_id) return null;
  return myUser.user_id + ':' + String(idx);
}

function getCommentDraft(idx = localIndex) {
  const key = commentDraftKey(idx);
  if (!key) return null;
  const drafts = loadCommentDrafts();
  return Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : null;
}

function setCommentDraft(idx, value) {
  const key = commentDraftKey(idx);
  if (!key) return;
  const drafts = loadCommentDrafts();
  drafts[key] = value || '';
  saveCommentDrafts(drafts);
}

function clearCommentDraft(idx = localIndex) {
  const key = commentDraftKey(idx);
  if (!key) return;
  const drafts = loadCommentDrafts();
  if (Object.prototype.hasOwnProperty.call(drafts, key)) {
    delete drafts[key];
    saveCommentDrafts(drafts);
  }
}

function getColorHex(key) {
  if (!serverState || !key) return '#d8c094';
  // Buscar en COLORS via onboardingColors (cargado al abrir modal) o
  // pedir directamente al API (cacheado tras primera llamada)
  const found = onboardingColors.find(c => c.key === key);
  return found ? found.hex : '#d8c094';
}

function refreshVoteUI() {
  // Header del bloque: muestra el color y nombre del usuario (si existe)
  const dot = document.getElementById('vote-dot');
  const userName = document.getElementById('vote-user-name');
  const editBtn = document.getElementById('vote-edit-btn');
  if (!dot || !userName) return;
  if (myUser) {
    dot.style.background = getColorHex(myUser.color);
    userName.textContent = 'Tu voto · ' + (myUser.name || '—');
    editBtn.style.display = '';
  } else {
    dot.style.background = '#d8c094';
    userName.textContent = 'Tu voto';
    editBtn.style.display = 'none';
  }
  applyVoteToStars();
  applyAggregate();
}

function applyVoteToStars() {
  document.querySelectorAll('.vote-star').forEach((star, i) => {
    // Relleno parcial: la estrella i se llena hasta (myVoteScore - i), recortado
    // a 0..1. Así una nota de 3.5 llena las 3 primeras al 100% y la 4ª al 50%.
    const fill = star.querySelector('.vote-star-fill');
    const pct = myVoteScore === null ? 0 : Math.max(0, Math.min(1, myVoteScore - i)) * 100;
    if (fill) fill.style.width = pct + '%';
    star.classList.toggle('filled', pct > 0);
  });
}

// Estado anterior del agregado por vino para detectar cambios y animar
let lastAggByWine = {};

function applyAggregate() {
  const valEl = document.getElementById('vote-aggregate-value');
  const pillEl = document.getElementById('tv-vote-pill');
  const pillStarsEl = document.getElementById('tv-vote-pill-stars');
  const pillValueEl = document.getElementById('tv-vote-pill-value');
  const pillCountEl = document.getElementById('tv-vote-pill-count');

  const hasSummary = serverState && serverState.votes_summary;
  const idx = localIndex;
  const agg = hasSummary ? serverState.votes_summary[String(idx)] : null;
  const hasVotes = agg && agg.count > 0;

  // ── Bloque grande (móvil) ──
  if (valEl) {
    if (!hasVotes) {
      valEl.innerHTML = '<span class="vote-agg-empty">Aún sin votos</span>';
    } else {
      const plural = agg.count === 1 ? 'voto' : 'votos';
      valEl.innerHTML =
        '<span class="vote-agg-stars">' + starsHtml(agg.avg) + '</span>' +
        '<span class="vote-agg-value">' + agg.avg.toFixed(1) + '</span>' +
        '<span class="vote-agg-count">· ' + agg.count + ' ' + plural + '</span>';
    }
  }

  // ── Pill TV ──
  if (pillEl && pillStarsEl && pillValueEl && pillCountEl) {
    if (!hasVotes) {
      pillEl.classList.add('empty');
      pillEl.classList.remove('has-votes');
      pillStarsEl.textContent = '☆☆☆☆☆';
      pillValueEl.textContent = '';
      pillCountEl.textContent = 'Aún sin votos';
    } else {
      pillEl.classList.remove('empty');
      pillEl.classList.add('has-votes');
      const plural = agg.count === 1 ? 'voto' : 'votos';
      pillStarsEl.innerHTML = starsHtml(agg.avg);
      pillValueEl.textContent = agg.avg.toFixed(1);
      pillCountEl.textContent = agg.count + ' ' + plural;
    }

    // ¿Cambió el agregado para este vino? Si sí, animar.
    const key = String(idx);
    const last = lastAggByWine[key];
    const current = hasVotes ? `${agg.avg}|${agg.count}` : 'empty';
    if (last !== undefined && last !== current) {
      // Trigger animation: quitar y volver a poner clase para reiniciar
      pillEl.classList.remove('bump');
      // Forzar reflow
      void pillEl.offsetWidth;
      pillEl.classList.add('bump');
      setTimeout(() => pillEl.classList.remove('bump'), 1100);
    }
    lastAggByWine[key] = current;
  }
}

function loadMyVoteForCurrentWine() {
  myVoteScore = null;
  myVoteComment = '';
  commentPendingText = null;

  const commentEl = document.getElementById('vote-comment');
  // Si el invitado está escribiendo AHORA en este campo, no lo tocamos: un update
  // por SSE (otro voto, etc.) no debe reescribir su texto ni moverle el cursor.
  const composing = commentEl && document.activeElement === commentEl;
  if (commentEl && !composing) commentEl.value = '';

  if (!myUser || !myUser._votes) {
    applyVoteToStars();
    if (typeof updateCommentBtnState === 'function') updateCommentBtnState();
    return;
  }

  const key = String(localIndex);
  const v = myUser._votes[key];
  if (v) {
    myVoteScore = v.score || null;
    myVoteComment = v.comment || '';
  }

  // Si hay un borrador local sin enviar para este vino, lo mostramos en lugar
  // del comentario guardado. Así un refresco/SSE no interrumpe lo que se escribe.
  const draft = getCommentDraft(localIndex);
  const textToShow = draft !== null ? draft : myVoteComment;
  if (commentEl && !composing) commentEl.value = textToShow;
  commentPendingText = (draft !== null && draft !== myVoteComment) ? draft : null;

  applyVoteToStars();
  if (typeof updateCommentBtnState === 'function') updateCommentBtnState();
}

async function fetchMyVotes() {
  if (!myUser) return;
  try {
    const r = await fetch('/api/me/' + encodeURIComponent(myUser.user_id), { cache: 'no-store' });
    if (r.status === 404) {
      // El user_id del localStorage ya no existe en server (reset). Limpiamos.
      myUser = null;
      localStorage.removeItem(STORAGE_KEY);
      refreshVoteUI();
      return;
    }
    if (!r.ok) return;
    const data = await r.json();
    myUser.name = data.name;
    myUser.color = data.color;
    myUser._votes = data.votes || {};
    myUser._pair_votes = data.pair_votes || {};
    saveMyUser();
    loadMyVoteForCurrentWine();
    refreshVoteUI();
  } catch (e) {
    console.warn('fetchMyVotes error', e);
  }
}

async function sendVote(scoreOrNull, commentOrNull, wineIndexOverride = null) {
  if (!myUser) return false;
  const wineIdx = (wineIndexOverride !== null && wineIndexOverride !== undefined)
    ? wineIndexOverride
    : localIndex;

  // si scoreOrNull es null y comment es null, no hacemos nada
  const body = { user_id: myUser.user_id };
  if (scoreOrNull !== null) body.score = scoreOrNull;
  if (commentOrNull !== null) body.comment = commentOrNull;

  // Actualización OPTIMISTA de la cache local del voto (score) ANTES del fetch.
  // Sin esto hay una carrera: el servidor emite el update por SSE y dispara
  // loadMyVoteForCurrentWine antes de que la respuesta del fetch actualice la
  // cache → la estrella recién pulsada se "desmarca" hasta el segundo tap.
  const key = String(wineIdx);
  let _prevVote = null;
  if (scoreOrNull !== null) {
    myUser._votes = myUser._votes || {};
    _prevVote = myUser._votes[key] ? { ...myUser._votes[key] } : undefined;
    myUser._votes[key] = { ...(myUser._votes[key] || {}), score: scoreOrNull };
    saveMyUser();
  }

  try {
    const r = await fetch('/api/vote/' + wineIdx, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      // Revertir la actualización optimista si el servidor la rechaza.
      if (scoreOrNull !== null) {
        if (_prevVote === undefined) delete myUser._votes[key];
        else myUser._votes[key] = _prevVote;
        saveMyUser();
      }
      return false;
    }

    // Confirmar/actualizar cache local de mi voto (score ya aplicado arriba).
    myUser._votes = myUser._votes || {};
    const existing = myUser._votes[key] || {};
    if (scoreOrNull !== null) existing.score = scoreOrNull;
    if (commentOrNull !== null) {
      if (commentOrNull) existing.comment = commentOrNull;
      else delete existing.comment;
      clearCommentDraft(wineIdx);
      if (wineIdx === localIndex) {
        myVoteComment = commentOrNull;
        commentPendingText = null;
      }
    }
    myUser._votes[key] = existing;
    saveMyUser();
    if (typeof updateCommentBtnState === 'function') updateCommentBtnState();
    return true;
  } catch (e) {
    console.warn('sendVote error', e);
    return false;
  }
}

async function deleteMyVote() {
  if (!myUser) return;
  try {
    await fetch('/api/vote/' + localIndex + '?user_id=' + encodeURIComponent(myUser.user_id), {
      method: 'DELETE',
    });
    if (myUser._votes && String(localIndex) in myUser._votes) {
      delete myUser._votes[String(localIndex)];
      saveMyUser();
    }
  } catch (e) {
    console.warn('deleteMyVote error', e);
  }
}

// ── Modo duelo: voto de preferencia ¿Viejo o Nuevo? (SOLO móvil) ─────────────
// El toggle aparece en el 2º vino de cada pareja ("al cerrar la pareja"). El
// duelo lado-a-lado es de la TV; en el móvil se vota secuencial + esta preferencia.
async function sendPairVote(pairIdx, choice) {
  if (!myUser) return false;
  try {
    const r = await fetch('/api/pair-vote/' + pairIdx, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: myUser.user_id, choice }),
    });
    if (!r.ok) return false;
    myUser._pair_votes = myUser._pair_votes || {};
    myUser._pair_votes[String(pairIdx)] = choice;
    saveMyUser();
    return true;
  } catch (e) {
    console.warn('sendPairVote error', e);
    return false;
  }
}

// pairIdx del vino actual si toca mostrar el toggle (2º vino de la pareja), o null.
function currentPairForVote() {
  if (!serverState || serverState.mode !== 'duelo') return null;
  if (serverState.is_welcome || serverState.is_summary) return null;
  if (localIndex % 2 !== 1) return null;   // solo en el 2º vino (índice impar)
  return Math.floor(localIndex / 2);
}

// Pinta (o quita) el bloque de preferencia en la vista de vino del móvil.
function renderPairVoteBlock() {
  if (!isMobile()) return;
  const infoArea = document.getElementById('info-area');
  let block = document.getElementById('pair-vote-block');
  const pairIdx = currentPairForVote();

  if (pairIdx === null || !infoArea) {
    if (block) block.remove();
    return;
  }

  const wines = serverState.all_wines || [];
  const wA = wines[pairIdx * 2], wB = wines[pairIdx * 2 + 1];
  const grape = (wA && wA.duel) || (wB && wB.duel) || (wA && wA.grape) || 'esta uva';

  const summary = serverState.pair_votes_summary
    && serverState.pair_votes_summary.pairs
    && serverState.pair_votes_summary.pairs[String(pairIdx)];
  const v = (summary && summary.viejo) || 0;
  const n = (summary && summary.nuevo) || 0;
  const mine = (myUser && myUser._pair_votes && myUser._pair_votes[String(pairIdx)]) || null;

  if (!block) {
    block = document.createElement('div');
    block.id = 'pair-vote-block';
    block.className = 'pair-vote-block';
    const mapC = infoArea.querySelector('.map-container');
    if (mapC) infoArea.insertBefore(block, mapC);
    else infoArea.appendChild(block);
  }
  block.dataset.pair = String(pairIdx);
  block.innerHTML = `
    <div class="pair-vote-title">⚔️ ${escapeHtml(grape)} · ¿cuál te gusta más?</div>
    <div class="pair-vote-btns">
      <button type="button" class="pair-vote-btn viejo ${mine === 'viejo' ? 'chosen' : ''}" data-choice="viejo">
        <span class="pair-vote-flag">🌍 Viejo Mundo</span>
        <span class="pair-vote-count">${v}</span>
      </button>
      <button type="button" class="pair-vote-btn nuevo ${mine === 'nuevo' ? 'chosen' : ''}" data-choice="nuevo">
        <span class="pair-vote-flag">🌎 Nuevo Mundo</span>
        <span class="pair-vote-count">${n}</span>
      </button>
    </div>`;
}

// Trae el bloque a la vista + flash (cuando el anfitrión lanza el aviso de voto).
function highlightPairVote() {
  const block = document.getElementById('pair-vote-block');
  if (!block) return;
  block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  block.classList.remove('flash');
  void block.offsetWidth;
  block.classList.add('flash');
  setTimeout(() => block.classList.remove('flash'), 2000);
}

// Click en los botones de preferencia
document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('.pair-vote-btn');
  if (!btn) return;
  const block = document.getElementById('pair-vote-block');
  if (!block) return;
  const pairIdx = parseInt(block.dataset.pair, 10);
  const choice = btn.dataset.choice;
  if (Number.isNaN(pairIdx)) return;
  if (!myUser) {
    showOnboarding('first', () => sendPairVote(pairIdx, choice).then(renderPairVoteBlock));
    return;
  }
  sendPairVote(pairIdx, choice).then(renderPairVoteBlock);
});

// Devuelve la nota (admite media) según en qué mitad de la estrella se toca:
// mitad izquierda = base - 0.5, mitad derecha = base. base = 1..5 (data-score).
function scoreFromStarTap(star, clientX) {
  const base = parseInt(star.dataset.score, 10);
  const rect = star.getBoundingClientRect();
  const leftHalf = rect.width > 0 && (clientX - rect.left) < rect.width / 2;
  return leftHalf ? base - 0.5 : base;
}

// Click en estrella
document.body.addEventListener('click', (e) => {
  const star = e.target.closest('.vote-star');
  if (!star) return;
  if (!isMobile()) return;  // solo móvil
  const newScore = scoreFromStarTap(star, e.clientX);
  if (!myUser) {
    // Pre-rellenamos visualmente para feedback inmediato
    myVoteScore = newScore;
    applyVoteToStars();
    showOnboarding('first', () => {
      sendVote(newScore, null);
    });
    return;
  }
  if (myVoteScore === newScore) {
    // tap en estrella ya activa = quitar voto
    myVoteScore = null;
    applyVoteToStars();
    deleteMyVote();
  } else {
    myVoteScore = newScore;
    applyVoteToStars();
    sendVote(newScore, null);
  }
});

// Comentario: envío manual con botón. No hay autosave remoto mientras se escribe.
// Guardamos un borrador local para que un refresco/SSE no corte la escritura.
async function submitCurrentComment() {
  const commentEl = document.getElementById('vote-comment');
  const btnEl = document.getElementById('vote-comment-btn');
  if (!commentEl) return;

  const text = commentEl.value.slice(0, 140);

  if (!myUser) {
    // Si aún no se ha identificado, dejamos que termine el onboarding y luego enviamos.
    showOnboarding('first', () => {
      submitCurrentComment();
    });
    return;
  }

  const wineIdx = localIndex;
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.classList.remove('saved');
    btnEl.textContent = 'Enviando…';
  }

  const ok = await sendVote(null, text, wineIdx);
  if (ok) {
    if (btnEl) {
      btnEl.classList.add('saved');
      btnEl.textContent = '✓ Guardado';
      btnEl.disabled = true;
    }
    // Si el anfitrión había avanzado mientras escribía, ahora que ya envió su
    // comentario le llevamos al vino que se sirve ahora.
    if (typeof catchupIdx !== 'undefined' && catchupIdx !== null && typeof catchUpToServer === 'function') {
      catchUpToServer();
    }
  } else if (btnEl) {
    btnEl.classList.remove('saved');
    btnEl.textContent = 'Reintentar';
    btnEl.disabled = false;
  }
}

document.body.addEventListener('input', (e) => {
  if (e.target.id !== 'vote-comment') return;
  const text = e.target.value.slice(0, 140);
  e.target.value = text;
  commentPendingText = text;
  if (myUser) setCommentDraft(localIndex, text);
  updateCommentBtnState();
});

// Enter en el textarea → enviar manualmente (sin nueva línea)
document.body.addEventListener('keydown', (e) => {
  if (e.target.id !== 'vote-comment') return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitCurrentComment();
    e.target.blur();
  }
});

// Click en botón "Enviar"
document.body.addEventListener('click', (e) => {
  if (e.target.id !== 'vote-comment-btn') return;
  submitCurrentComment();
});

// Estado visual del botón: "✓ Guardado", "Enviar" o "Reintentar"
function updateCommentBtnState() {
  const btnEl = document.getElementById('vote-comment-btn');
  const commentEl = document.getElementById('vote-comment');
  if (!btnEl || !commentEl) return;

  const current = commentEl.value;
  const savedComment = (myUser && myUser._votes && myUser._votes[String(localIndex)])
    ? (myUser._votes[String(localIndex)].comment || '')
    : '';

  if (current === savedComment) {
    if (!savedComment) {
      // Nada escrito ni guardado → sin botón (evita el "Guardado" fantasma)
      btnEl.classList.add('hidden');
    } else {
      btnEl.classList.remove('hidden');
      btnEl.classList.add('saved');
      btnEl.textContent = '✓ Guardado';
      btnEl.disabled = true;
    }
  } else {
    btnEl.classList.remove('hidden');
    btnEl.classList.remove('saved');
    btnEl.textContent = myUser ? 'Enviar comentario' : 'Identifícate y envía';
    btnEl.disabled = false;
  }
}

// Nota: no enviamos en blur, navegación, beforeunload ni pagehide.
// Si el usuario no pulsa "Enviar", el texto queda como borrador local en ese móvil.

// Botón "Editar perfil"
document.body.addEventListener('click', (e) => {
  if (e.target.id !== 'vote-edit-btn') return;
  showOnboarding('edit');
});

// Cuando cambia el vino visualizado (localIndex), recargar mi voto
const _origRenderCurrent = renderCurrent;
window._afterRender = function() {
  loadMyVoteForCurrentWine();
  refreshVoteUI();
  renderPairVoteBlock();
};
// Wrap renderCurrent para llamar al hook después
renderCurrent = function() {
  _origRenderCurrent();
  if (window._afterRender) window._afterRender();
};

// Cargar voto inicial cuando llegue el primer payload
const _origOnServerUpdate = onServerUpdate;
onServerUpdate = function(payload) {
  _origOnServerUpdate(payload);
  applyAggregate();
  syncQr(payload);
};

// Al cargar la página, si ya hay user, sincronizar con server (validar y traer votos)
if (myUser && myUser.user_id) {
  fetchColors().then(() => {
    refreshVoteUI();
    fetchMyVotes();
  });
} else {
  // Pre-cargar colores para que getColorHex funcione
  fetchColors();
}

// Botón fullscreen — solo se puede activar con un gesto del usuario
document.getElementById('fs-btn').addEventListener('click', () => {
  const el = document.documentElement;
  const req = el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.mozRequestFullScreen
    || el.msRequestFullscreen;
  if (req) req.call(el);
});

// QR con la URL actual (root del sitio). Se genera una vez; su visibilidad la
// decide el anfitrión desde el control (payload.show_qr). Por defecto OFF.
let qrReady = false;
try {
  const qr = qrcode(0, 'M');
  qr.addData(window.location.origin + '/');
  qr.make();
  document.getElementById('qr-img').innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
  qrReady = true;
} catch (err) {
  console.warn('QR fallo:', err);
}

// Muestra/oculta el QR (solo TV) según lo active el anfitrión. Se llama en cada
// update del servidor. Nunca en móvil ni en la pantalla de bienvenida.
function syncQr(payload) {
  const widget = document.getElementById('qr-widget');
  if (!widget) return;
  const show = qrReady && !!(payload && payload.show_qr) && !isMobile() && !(payload && payload.is_welcome);
  widget.style.display = show ? 'flex' : 'none';
}

// ── Overlay de foto ampliada (móvil) ──
const photoOverlay = document.getElementById('photo-overlay');
const photoOverlayImg = photoOverlay.querySelector('img');
const photoOverlayClose = photoOverlay.querySelector('.photo-overlay-close');

function openPhotoOverlay(src) {
  if (!src) return;
  photoOverlayImg.src = src;
  photoOverlay.classList.add('visible');
}
function closePhotoOverlay() {
  photoOverlay.classList.remove('visible');
  // limpiar src tras animación para no quedarse cacheado
  setTimeout(() => { photoOverlayImg.src = ''; }, 200);
}
photoOverlay.addEventListener('click', (e) => {
  // Click en el fondo o en la imagen → cerrar
  if (e.target === photoOverlay || e.target === photoOverlayImg || e.target === photoOverlayClose) {
    closePhotoOverlay();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && photoOverlay.classList.contains('visible')) {
    closePhotoOverlay();
  }
});

// Tap en foto de vino actual o foto de tarjeta del resumen → abre overlay (solo en pantallas pequeñas)
document.body.addEventListener('click', (e) => {
  if (!isMobile()) return;
  // Vista individual
  const bottleArea = e.target.closest('#bottle-area');
  if (bottleArea) {
    const img = bottleArea.querySelector('img#bottle');
    if (img && img.src && img.style.display !== 'none') {
      openPhotoOverlay(img.src);
    }
    return;
  }
  // Resumen
  const summaryPhoto = e.target.closest('.summary-card-photo');
  if (summaryPhoto) {
    const img = summaryPhoto.querySelector('img');
    if (img && img.src) {
      openPhotoOverlay(img.src);
    }
  }
});

initApp();
