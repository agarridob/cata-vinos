let state = null;
let busy = false;
let colorMap = {};
let currentConfig = null;

async function fetchColorMap() {
  try {
    const r = await fetch('/api/colors', { cache: 'no-store' });
    const colors = await r.json();
    colorMap = {};
    colors.forEach(c => { colorMap[c.key] = c.hex; });
  } catch (e) {}
}

async function fetchState() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    state = await r.json();
    render();
    renderUsers();
    syncAdminButtons();
    renderSummaryControl();
  } catch (e) { console.error(e); }
}

async function go(action) {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch(`/api/${action}`, { method: 'POST' });
    state = await r.json();
    render();
    renderUsers();
    syncAdminButtons();
    renderSummaryControl();
  } catch (e) { console.error(e); }
  finally { busy = false; }
}

async function gotoIdx(i) {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch(`/api/goto/${i}`, { method: 'POST' });
    state = await r.json();
    render();
    renderUsers();
    syncAdminButtons();
    renderSummaryControl();
  } catch (e) { console.error(e); }
  finally { busy = false; }
}

async function reload() {
  if (busy) return;
  busy = true;
  try {
    await fetch('/api/reload', { method: 'POST' });
    await fetchState();
  } finally { busy = false; }
}

function render() {
  const content = document.getElementById('content');
  if (!content) return;
  if (!state || state.total === 0) {
    content.innerHTML = `
      <div class="empty">
        Sin vinos cargados.<br><br>
        <button class="btn" onclick="reload()" style="display:inline-block;padding:14px 28px">Recargar</button>
      </div>`;
    return;
  }

  let cardHtml;
  if (state.is_welcome) {
    cardHtml = `
      <div class="current-card">
        <div class="current-label">Pantalla actual</div>
        <div class="current-name">Bienvenida</div>
        <div class="current-winery">${state.total} vinos preparados</div>
        <div class="current-counter">La cata aún no ha empezado</div>
      </div>`;
  } else if (state.is_summary) {
    cardHtml = `
      <div class="current-card">
        <div class="current-label">Pantalla actual</div>
        <div class="current-name">Resumen de la cata</div>
        <div class="current-winery">${state.total} vinos</div>
        <div class="current-counter">Final de la velada</div>
      </div>`;
  } else {
    let metaHtml = '';
    const ratingPairs = wineRatingPairs(state.wine);
    if (ratingPairs.length) {
      const inner = ratingPairs.map(p =>
        `<span class="current-meta-pair">${p.sys ? `<span class="current-meta-system">${escapeHtml(p.sys)}</span>` : ''}<span class="current-meta-score">${escapeHtml(p.sco)}</span></span>`
      ).join('<span class="current-meta-sep">·</span>');
      metaHtml = `<div class="current-meta">${inner}</div>`;
    }
    let duelBadge = '';
    if (state.mode === 'duelo') {
      const pairIdx = Math.floor(state.index / 2);
      const nPairs = Math.floor(state.total / 2);
      const side = state.wine.world === 'nuevo' ? '🌎 Nuevo Mundo' : '🌍 Viejo Mundo';
      const grape = state.wine.duel ? ' · ' + escapeHtml(state.wine.duel) : '';
      duelBadge = `<div class="current-duel">Uva ${pairIdx + 1} de ${nPairs}${grape} · ${side}</div>`;
    }
    cardHtml = `
      <div class="current-card">
        <div class="current-label">Sirviendo ahora</div>
        ${duelBadge}
        <div class="current-name">${escapeHtml(state.wine.name || '—')}</div>
        <div class="current-winery">${escapeHtml(state.wine.winery || '—')}</div>
        ${metaHtml}
        <div class="current-counter">${state.index + 1} de ${state.total}</div>
      </div>`;
  }

  const prevDisabled = state.is_welcome || state.index <= 0;
  const nextDisabled = !state.is_welcome && state.index >= state.total;
  const nextLabel = state.is_welcome ? '▶ Empezar la cata' : (state.index === state.total - 1 ? 'Ir a resumen ▶' : 'Siguiente ▶');

  content.innerHTML = `
    ${cardHtml}
    <div class="buttons">
      <button class="btn" id="btn-prev" ${prevDisabled ? 'disabled' : ''}>◀ Anterior</button>
      <button class="btn ${state.is_welcome ? 'btn-primary-start' : ''}" id="btn-next" ${nextDisabled ? 'disabled' : ''}>${nextLabel}</button>
    </div>
    <div class="list-title">Carta de la velada</div>
    <div class="wine-list" id="list"></div>
    <div class="footer"><button onclick="reload()">↻ Recargar wines.json</button></div>`;

  document.getElementById('btn-prev').onclick = () => go('prev');
  document.getElementById('btn-next').onclick = () => go('next');

  const list = document.getElementById('list');
  state.all_titles.forEach((w, i) => {
    const item = document.createElement('div');
    item.className = 'wine-item';
    if (!state.is_welcome && !state.is_summary && i === state.index) item.classList.add('active');
    else if (!state.is_welcome && i < state.index) item.classList.add('done');
    item.innerHTML = `
      <div class="wine-num">${i + 1}</div>
      <div class="wine-info">
        <div class="wine-item-name">${escapeHtml(w.name || '—')}</div>
        <div class="wine-item-winery">${escapeHtml(w.winery || '—')}</div>
      </div>`;
    item.onclick = () => gotoIdx(i);
    list.appendChild(item);
  });

  const summary = document.createElement('div');
  summary.className = 'wine-item summary-item';
  if (state.is_summary) summary.classList.add('active');
  summary.innerHTML = `
    <div class="wine-num">∑</div>
    <div class="wine-info">
      <div class="wine-item-name">Resumen</div>
      <div class="wine-item-winery">${state.total} vinos · final</div>
    </div>`;
  summary.onclick = () => gotoIdx(state.total);
  list.appendChild(summary);
}

function syncAdminButtons() {
  const welcomeBtn = document.getElementById('btn-welcome-back');
  if (welcomeBtn && state) {
    welcomeBtn.disabled = !!state.is_welcome;
    welcomeBtn.style.opacity = state.is_welcome ? '0.4' : '';
  }
  // Los avisos de voto solo tienen sentido estando en un vino (no en bienvenida/resumen).
  const noWine = !!(state && (state.is_welcome || state.is_summary));
  ['btn-vote-alert', 'btn-vote-alert-hide'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn && state) {
      btn.disabled = noWine;
      btn.style.opacity = noWine ? '0.4' : '';
    }
  });

  // Interruptor + indicador de Modo Duelo.
  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn && state) {
    const on = state.mode === 'duelo';
    modeBtn.classList.toggle('is-on', on);
    const lbl = document.getElementById('mode-toggle-label');
    const sub = document.getElementById('mode-toggle-sub');
    if (lbl) lbl.textContent = on ? '⚔️ Modo Duelo: ACTIVO' : 'Modo Duelo: desactivado';
    if (sub) sub.textContent = on
      ? 'Viejo vs Nuevo — pulsa para pasar a cata normal'
      : 'Cata normal — pulsa para activar el duelo';
  }

  // Interruptor + indicador del QR en la TV.
  const qrBtn = document.getElementById('btn-qr-toggle');
  if (qrBtn && state) {
    const on = !!state.show_qr;
    qrBtn.classList.toggle('is-on', on);
    const lbl = document.getElementById('qr-toggle-label');
    const sub = document.getElementById('qr-toggle-sub');
    if (lbl) lbl.textContent = on ? '📱 QR en la TV: ACTIVO' : 'QR en la TV: oculto';
    if (sub) sub.textContent = on
      ? 'Se ve abajo a la izquierda — pulsa para ocultarlo'
      : 'Oculto — pulsa para mostrarlo en la TV';
  }

  // Botón "¿Viejo o Nuevo?" (modo duelo): visible solo en duelo, y activo solo
  // cuando la pareja está servida (anfitrión en el 2º vino, índice impar).
  const prefBtn = document.getElementById('btn-pref-alert');
  if (prefBtn && state) {
    const isDuel = state.mode === 'duelo';
    prefBtn.style.display = isDuel ? '' : 'none';
    const pairServed = isDuel && !noWine && (state.index % 2 === 1);
    prefBtn.disabled = !pairServed;
    prefBtn.style.opacity = pairServed ? '' : '0.4';
  }
}

// ──────────────────────────────────────────
// Presentación del resumen: tarjetas / viaje
// ──────────────────────────────────────────

async function setSummaryAuto(auto) {
  if (busy) return;
  busy = true;

  try {
    const r = await fetch('/api/summary-auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      showToast(data.error || 'No se pudo cambiar el modo automático', true);
      return;
    }

    await fetchState();
    showToast(auto ? 'Resumen automático activado' : 'Resumen automático detenido');
  } catch (e) {
    console.error(e);
    showToast('Error de red al cambiar el modo automático', true);
  } finally {
    busy = false;
  }
}

async function setSummaryView(view) {
  if (busy) return;
  busy = true;

  try {
    const r = await fetch('/api/summary-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      showToast(data.error || 'No se pudo fijar la vista del resumen', true);
      return;
    }

    await fetchState();

    if (view === 'journey') {
      showToast('Viaje de la cata fijado en TV');
    } else {
      showToast('Resumen original fijado en TV');
    }
  } catch (e) {
    console.error(e);
    showToast('Error de red al fijar la vista', true);
  } finally {
    busy = false;
  }
}

function renderSummaryControl() {
  const box = document.getElementById('summary-control');
  const status = document.getElementById('summary-control-status');

  const btnAuto = document.getElementById('btn-summary-auto');
  const btnCards = document.getElementById('btn-summary-cards');
  const btnJourney = document.getElementById('btn-summary-journey');

  if (!box || !status) return;

  const isSummary = !!(state && state.is_summary);
  const auto = !state || state.summary_auto !== false;
  const view = state && state.summary_view ? state.summary_view : 'cards';

  box.classList.toggle('is-muted', !isSummary);

  if (auto) {
    status.textContent = 'Automático activo · alterna resumen y viaje cada 15s';
  } else if (view === 'journey') {
    status.textContent = 'Manual · viaje de la cata fijo en TV';
  } else {
    status.textContent = 'Manual · resumen original fijo en TV';
  }

  if (btnAuto) btnAuto.classList.toggle('active', auto);
  if (btnCards) btnCards.classList.toggle('active', !auto && view === 'cards');
  if (btnJourney) btnJourney.classList.toggle('active', !auto && view === 'journey');
}

function bindSummaryControls() {
  const btnAuto = document.getElementById('btn-summary-auto');
  const btnCards = document.getElementById('btn-summary-cards');
  const btnJourney = document.getElementById('btn-summary-journey');

  if (btnAuto) {
    btnAuto.onclick = () => setSummaryAuto(true);
  }

  if (btnCards) {
    btnCards.onclick = () => setSummaryView('cards');
  }

  if (btnJourney) {
    btnJourney.onclick = () => setSummaryView('journey');
  }
}

// ──────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────
function setActiveTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  try { localStorage.setItem('control_active_tab', tab); } catch (e) {}
  if (tab === 'admin' && !currentConfig) loadWifiConfig(false);
}

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => setActiveTab(btn.dataset.tab);
  });
  let saved = 'cata';
  try { saved = localStorage.getItem('control_active_tab') || 'cata'; } catch (e) {}
  setActiveTab(saved);
}

// ──────────────────────────────────────────
// Wines config shared helper
// ──────────────────────────────────────────
async function fetchWinesConfig() {
  const r = await fetch('/api/wines-config', { cache: 'no-store' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  currentConfig = data;
  return data;
}

async function saveWinesConfig(config) {
  const r = await fetch('/api/wines-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  currentConfig = config;
  return data;
}

// ──────────────────────────────────────────
// Editor visual de vinos
// ──────────────────────────────────────────
let winesEditorLoaded = false;
let winesEditorData = { session: '', wifi: null, wines: [] };
let wineEditorControlsBound = false;

function setWinesEditorStatus(msg, isError = false) {
  const el = document.getElementById('wines-editor-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function emptyWine() {
  return { name: '', winery: '', vintage: '', do: '', grape: '', region: '', ratings: [], curiosity: '', photo: '', type: '', coords: ['', ''] };
}

function normalizeWineForEditor(w) {
  const out = emptyWine();
  ['name','winery','vintage','do','grape','region','curiosity','photo','type'].forEach(k => {
    out[k] = w && w[k] != null ? String(w[k]) : '';
  });
  out.ratings = ratingsFromWine(w);
  if (w && Array.isArray(w.coords) && w.coords.length === 2) {
    out.coords = [w.coords[0] != null ? String(w.coords[0]) : '', w.coords[1] != null ? String(w.coords[1]) : ''];
  }
  // Campos del modo duelo: no se editan aquí, pero se conservan para no perder
  // la configuración de una cata de duelo al guardar desde el editor.
  if (w && (w.world === 'viejo' || w.world === 'nuevo')) out.world = w.world;
  if (w && w.duel != null && String(w.duel).trim()) out.duel = String(w.duel);
  if (w && w.duel_note != null && String(w.duel_note).trim()) out.duel_note = String(w.duel_note);
  return out;
}

async function loadWinesEditor() {
  setWinesEditorStatus('Cargando carta…');
  try {
    const data = await fetchWinesConfig();
    winesEditorData = {
      session: data.session || '',
      wifi: data.wifi || null,
      mode: data.mode || null,
      wines: Array.isArray(data.wines) ? data.wines.map(normalizeWineForEditor) : [],
    };
    winesEditorLoaded = true;
    renderWinesEditor();
    setWinesEditorStatus(`Carta cargada: ${winesEditorData.wines.length} vinos.`);
  } catch (e) {
    console.error(e);
    setWinesEditorStatus('No se pudo cargar la carta.', true);
  }
}

function collectWinesEditorData() {
  const sessionInput = document.getElementById('editor-session-name');
  if (sessionInput) winesEditorData.session = sessionInput.value.trim();
  document.querySelectorAll('.wine-editor-card').forEach(card => {
    const idx = parseInt(card.dataset.idx, 10);
    const wine = winesEditorData.wines[idx];
    if (!wine) return;
    card.querySelectorAll('[data-field]').forEach(input => {
      const f = input.dataset.field;
      if (f === 'lat') wine.coords[0] = input.value.trim();
      else if (f === 'lon') wine.coords[1] = input.value.trim();
      else wine[f] = input.value.trim();
    });
    // Puntuaciones: se conservan las filas tal cual (incluidas las vacías) para
    // que una fila recién añadida sobreviva al re-render; se filtran al guardar.
    const ratings = [];
    card.querySelectorAll('.rating-row').forEach(row => {
      const nameEl = row.querySelector('[data-rating-field="name"]');
      const scoreEl = row.querySelector('[data-rating-field="score"]');
      ratings.push({ name: nameEl ? nameEl.value.trim() : '', score: scoreEl ? scoreEl.value.trim() : '' });
    });
    wine.ratings = ratings;
  });
}

function renderWinesEditor() {
  const sessionInput = document.getElementById('editor-session-name');
  const list = document.getElementById('wines-editor-list');
  if (!sessionInput || !list || !winesEditorLoaded) return;
  sessionInput.value = winesEditorData.session || '';
  list.innerHTML = '';
  winesEditorData.wines.forEach((w, idx) => {
    const card = document.createElement('div');
    card.className = 'wine-editor-card';
    card.dataset.idx = String(idx);
    const title = w.name || `Vino ${idx + 1}`;
    card.innerHTML = `
      <div class="wine-editor-head">
        <div class="wine-editor-title">${idx + 1}. ${escapeHtml(title)}</div>
        <div class="wine-editor-actions">
          <button class="mini-btn" data-editor-action="up" title="Subir">↑</button>
          <button class="mini-btn" data-editor-action="down" title="Bajar">↓</button>
          <button class="mini-btn" data-editor-action="duplicate" title="Duplicar">⧉</button>
          <button class="mini-btn danger" data-editor-action="delete" title="Eliminar">✕</button>
        </div>
      </div>
      <div class="wine-editor-grid">
        ${editorField('Nombre', 'name', w.name)}
        ${editorField('Bodega', 'winery', w.winery)}
        ${editorField('Añada', 'vintage', w.vintage)}
        ${editorField('D.O.', 'do', w.do)}
        ${editorField('Uva', 'grape', w.grape)}
        ${editorSelect('Tipo', 'type', w.type, WINE_TYPE_OPTIONS)}
        ${editorField('Región', 'region', w.region)}
        ${editorPhoto(w.photo)}
        ${editorField('Latitud', 'lat', w.coords[0])}
        ${editorField('Longitud', 'lon', w.coords[1])}
        ${editorRatings(w.ratings)}
        <label class="editor-label full">Curiosidad
          <textarea class="editor-textarea" data-field="curiosity">${escapeHtml(w.curiosity || '')}</textarea>
        </label>
      </div>`;
    list.appendChild(card);
  });
}

function editorField(label, field, value) {
  return `<label class="editor-label">${label}<input class="editor-input" data-field="${field}" value="${escapeAttr(value || '')}"></label>`;
}

// Campo Foto: miniatura + nombre (con sugerencias de las fotos del servidor) + subir.
function photoUrl(name) {
  return `/static/photos/${encodeURIComponent(name)}`;
}

function photoThumbHtml(name) {
  return name
    ? `<img class="photo-thumb" src="${photoUrl(name)}" alt="" onerror="this.classList.add('broken')">`
    : '<div class="photo-thumb empty">sin foto</div>';
}

function editorPhoto(value) {
  return `
    <div class="editor-label full photo-editor">Foto
      <div class="photo-row">
        <div class="photo-thumb-slot">${photoThumbHtml(value)}</div>
        <input class="editor-input" data-field="photo" list="photo-names" placeholder="archivo.png" value="${escapeAttr(value || '')}">
        <button class="mini-btn" data-photo-action="upload" title="Subir foto">📷 Subir</button>
      </div>
    </div>`;
}

// Sub-editor de puntuaciones: N filas de {Sistema, Nota} + botón para añadir.
function editorRatings(ratings) {
  const rows = (Array.isArray(ratings) ? ratings : []).map((r, i) => `
    <div class="rating-row" data-rating-idx="${i}">
      <input class="editor-input" data-rating-field="name" placeholder="Sistema (p.ej. Parker)" value="${escapeAttr(r.name || '')}">
      <input class="editor-input" data-rating-field="score" placeholder="Nota (p.ej. 92+)" value="${escapeAttr(r.score || '')}">
      <button class="mini-btn danger" data-rating-action="remove" title="Quitar puntuación">✕</button>
    </div>`).join('');
  return `
    <div class="editor-label full ratings-editor">Puntuaciones
      <div class="ratings-rows">${rows}</div>
      <button class="mini-btn ratings-add" data-rating-action="add">+ puntuación</button>
    </div>`;
}

const WINE_TYPE_OPTIONS = [
  ['', '— sin definir —'],
  ['tinto', 'Tinto'],
  ['clarete', 'Clarete'],
  ['blanco', 'Blanco'],
  ['rosado', 'Rosado'],
  ['orange', 'Orange'],
  ['espumoso', 'Espumoso'],
];

function editorSelect(label, field, value, options) {
  const opts = options.map(([val, txt]) =>
    `<option value="${escapeAttr(val)}"${val === (value || '') ? ' selected' : ''}>${escapeHtml(txt)}</option>`
  ).join('');
  return `<label class="editor-label">${label}<select class="editor-input" data-field="${field}">${opts}</select></label>`;
}

function buildWinesEditorPayload() {
  collectWinesEditorData();
  return {
    session: winesEditorData.session,
    wifi: winesEditorData.wifi,
    ...(winesEditorData.mode ? { mode: winesEditorData.mode } : {}),
    wines: winesEditorData.wines.map(w => {
      const out = { name: w.name || '', winery: w.winery || '', vintage: w.vintage || '', do: w.do || '', grape: w.grape || '', region: w.region || '', curiosity: w.curiosity || '', photo: w.photo || '', type: w.type || '' };
      const ratings = (Array.isArray(w.ratings) ? w.ratings : [])
        .map(r => ({ name: String(r.name || '').trim(), score: String(r.score || '').trim() }))
        .filter(r => r.name || r.score);
      if (ratings.length) out.ratings = ratings;
      const lat = String(w.coords?.[0] || '').trim();
      const lon = String(w.coords?.[1] || '').trim();
      if (lat !== '' && lon !== '') out.coords = [Number(lat), Number(lon)];
      // Conservar campos de duelo (no editables aquí).
      if (w.world === 'viejo' || w.world === 'nuevo') out.world = w.world;
      if (w.duel != null && String(w.duel).trim()) out.duel = String(w.duel).trim();
      if (w.duel_note != null && String(w.duel_note).trim()) out.duel_note = String(w.duel_note).trim();
      return out;
    }),
  };
}

async function saveWinesEditor() {
  if (!winesEditorLoaded) return showToast('Primero carga el editor.', true);
  if (!confirm('¿Guardar los cambios en wines.json y refrescar la TV?')) return;
  setWinesEditorStatus('Guardando carta…');
  try {
    const payload = buildWinesEditorPayload();
    const data = await saveWinesConfig(payload);
    showToast(`Carta guardada (${data.count} vinos).`);
    setWinesEditorStatus(`Guardado OK · ${data.count} vinos.`);
    await fetchState();
  } catch (e) {
    console.error(e);
    setWinesEditorStatus(`No se pudo guardar: ${e.message}`, true);
    showToast('No se pudo guardar la carta', true);
  }
}

function addEditorWine() {
  if (!winesEditorLoaded) winesEditorLoaded = true;
  collectWinesEditorData();
  winesEditorData.wines.push(emptyWine());
  renderWinesEditor();
  setWinesEditorStatus('Vino añadido. Recuerda guardar cambios.');
}

async function handleLoadSampleWines() {
  if (!confirm('⚠️ MODO PRUEBAS ⚠️\n\n¿Cargar la carta de pruebas (14 vinos de ejemplo)?\n\nSustituye la carta actual (wines.json) y refresca la TV.\nNo afecta a votos ni invitados.')) return;
  setWinesEditorStatus('Cargando vinos de pruebas…');
  try {
    const r = await fetch('/api/wines-config/load-sample', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    showToast(`Carta de pruebas cargada (${data.count} vinos).`);
    setWinesEditorStatus(`Vinos de pruebas cargados · ${data.count} vinos.`);
    await loadWinesEditor();
    await fetchState();
  } catch (e) {
    console.error(e);
    const msg = e.message === 'sample_not_found'
      ? 'No existe data/wines.pruebas.json en el servidor.'
      : `No se pudieron cargar los vinos de pruebas: ${e.message}`;
    setWinesEditorStatus(msg, true);
    showToast('No se pudo cargar la carta de pruebas', true);
  }
}

function handleEditorAction(e) {
  const photoBtn = e.target.closest('[data-photo-action="upload"]');
  if (photoBtn) {
    const card = photoBtn.closest('.wine-editor-card');
    if (card) pickPhoto(parseInt(card.dataset.idx, 10));
    return;
  }

  // Añadir/quitar puntuaciones dentro de una tarjeta.
  const ratingBtn = e.target.closest('[data-rating-action]');
  if (ratingBtn) {
    const card = ratingBtn.closest('.wine-editor-card');
    if (!card) return;
    collectWinesEditorData();
    const wine = winesEditorData.wines[parseInt(card.dataset.idx, 10)];
    if (!wine) return;
    if (!Array.isArray(wine.ratings)) wine.ratings = [];
    if (ratingBtn.dataset.ratingAction === 'add') {
      wine.ratings.push({ name: '', score: '' });
    } else {
      const row = ratingBtn.closest('.rating-row');
      if (row) wine.ratings.splice(parseInt(row.dataset.ratingIdx, 10), 1);
    }
    renderWinesEditor();
    setWinesEditorStatus('Cambios pendientes de guardar.');
    return;
  }

  const btn = e.target.closest('[data-editor-action]');
  if (!btn) return;
  const card = btn.closest('.wine-editor-card');
  if (!card) return;
  collectWinesEditorData();
  const idx = parseInt(card.dataset.idx, 10);
  const action = btn.dataset.editorAction;
  if (action === 'delete') {
    if (!confirm(`¿Eliminar el vino ${idx + 1}?`)) return;
    winesEditorData.wines.splice(idx, 1);
  } else if (action === 'duplicate') {
    winesEditorData.wines.splice(idx + 1, 0, JSON.parse(JSON.stringify(winesEditorData.wines[idx])));
  } else if (action === 'up' && idx > 0) {
    [winesEditorData.wines[idx - 1], winesEditorData.wines[idx]] = [winesEditorData.wines[idx], winesEditorData.wines[idx - 1]];
  } else if (action === 'down' && idx < winesEditorData.wines.length - 1) {
    [winesEditorData.wines[idx + 1], winesEditorData.wines[idx]] = [winesEditorData.wines[idx], winesEditorData.wines[idx + 1]];
  }
  renderWinesEditor();
  setWinesEditorStatus('Cambios pendientes de guardar.');
}

function bindWineEditorControls() {
  if (wineEditorControlsBound) return;
  wineEditorControlsBound = true;
  document.getElementById('btn-load-editor').onclick = loadWinesEditor;
  document.getElementById('btn-add-editor-wine').onclick = addEditorWine;
  document.getElementById('btn-save-editor').onclick = saveWinesEditor;
  const sampleBtn = document.getElementById('btn-load-sample-wines');
  if (sampleBtn) sampleBtn.onclick = handleLoadSampleWines;
  const list = document.getElementById('wines-editor-list');
  list.onclick = handleEditorAction;
  // Al escribir/elegir otro nombre de foto, refrescar la miniatura.
  list.addEventListener('change', e => {
    if (e.target.dataset.field !== 'photo') return;
    const slot = e.target.closest('.photo-row').querySelector('.photo-thumb-slot');
    slot.innerHTML = photoThumbHtml(e.target.value.trim());
    setWinesEditorStatus('Cambios pendientes de guardar.');
  });

  const winesInput = document.getElementById('wines-file-input');
  document.getElementById('btn-upload-wines').onclick = () => winesInput.click();
  winesInput.onchange = () => {
    const file = winesInput.files[0];
    winesInput.value = '';
    if (file) uploadWinesFile(file);
  };

  const photoInput = document.getElementById('photo-file-input');
  document.getElementById('btn-upload-photo').onclick = () => pickPhoto(null);
  photoInput.onchange = () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (file) uploadPhoto(file);
  };
  document.getElementById('photo-gallery').addEventListener('toggle', e => {
    if (e.target.open) loadPhotos();
  });
  loadPhotos();
}

// ──────────────────────────────────────────
// Subir wines.json completo
// ──────────────────────────────────────────
async function uploadWinesFile(file) {
  if (!confirm(`¿Sustituir la carta actual por «${file.name}»?\n\nSe refresca la TV. La carta anterior queda guardada como data/wines.json.prev.\nNo afecta a votos ni invitados.`)) return;
  setWinesEditorStatus('Subiendo wines.json…');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/wines-config/upload', { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
    await loadWinesEditor();
    await fetchState();
    const missing = data.missing_photos || [];
    if (missing.length) {
      setWinesEditorStatus(`Carta subida (${data.count} vinos). Faltan fotos en el servidor: ${missing.join(', ')}`, true);
      showToast(`Carta subida · faltan ${missing.length} fotos`, true);
    } else {
      setWinesEditorStatus(`Carta subida · ${data.count} vinos.`);
      showToast(`Carta subida (${data.count} vinos).`);
    }
  } catch (e) {
    console.error(e);
    setWinesEditorStatus(`No se pudo subir: ${e.message}`, true);
    showToast('No se pudo subir el wines.json', true);
  }
}

// ──────────────────────────────────────────
// Fotos
// ──────────────────────────────────────────
let photoUploadTarget = null;   // índice del vino al que va la foto, o null (suelta)

function pickPhoto(idx) {
  photoUploadTarget = idx;
  document.getElementById('photo-file-input').click();
}

// Las fotos del móvil pesan varios MB: se reducen a 1600 px antes de subir.
// Las PNG siguen siendo PNG (las botellas recortadas llevan transparencia).
const PHOTO_MAX_PX = 1600;
const PHOTO_KEEP_BYTES = 1.5 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('formato de imagen no soportado')); };
    img.src = url;
  });
}

async function preparePhoto(file) {
  const known = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
  if (known && (file.size <= PHOTO_KEEP_BYTES || file.type === 'image/gif')) return file;
  const img = await loadImage(file);
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('no se pudo procesar la imagen'))), type, 0.85);
  });
}

async function uploadPhoto(file) {
  const idx = photoUploadTarget;
  photoUploadTarget = null;
  if (idx != null) collectWinesEditorData();
  const wine = idx != null ? winesEditorData.wines[idx] : null;
  setWinesEditorStatus('Subiendo foto…');
  try {
    let blob = await preparePhoto(file);
    if (bgRemoveWanted()) {
      blob = await maybeRemoveBackground(blob);
      if (!blob) { setWinesEditorStatus('Subida de foto cancelada.'); return; }
      setWinesEditorStatus('Subiendo foto…');
    }
    const fd = new FormData();
    fd.append('file', blob, file.name || 'foto');
    const suggested = wine ? (wine.name || wine.winery) : '';
    if (suggested) fd.append('name', suggested);
    const r = await fetch('/api/photos', { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 413 ? 'la foto es demasiado grande' : (data.error || `HTTP ${r.status}`));
    await loadPhotos();
    if (wine) {
      wine.photo = data.name;
      renderWinesEditor();
      setWinesEditorStatus(`Foto «${data.name}» asignada al vino ${idx + 1}. Recuerda guardar la carta.`);
    } else {
      setWinesEditorStatus(`Foto subida como «${data.name}».`);
    }
    showToast('Foto subida');
  } catch (e) {
    console.error(e);
    setWinesEditorStatus(`No se pudo subir la foto: ${e.message}`, true);
    showToast('No se pudo subir la foto', true);
  }
}

// Quitar fondo: lo hace el servidor (POST /api/photos/remove-bg, unos segundos)
// y aquí se elige entre original y recortada antes de subir. La casilla solo
// aparece si el servidor tiene el modelo instalado (bg_remove en /api/photos).
const BG_REMOVE_KEY = 'control_bg_remove';

function bgRemoveWanted() {
  return !document.getElementById('bg-remove-toggle').hidden
    && document.getElementById('bg-remove-check').checked;
}

function setupBgRemoveToggle(available) {
  const toggle = document.getElementById('bg-remove-toggle');
  const check = document.getElementById('bg-remove-check');
  toggle.hidden = !available;
  if (check.dataset.bound) return;
  check.dataset.bound = '1';
  try { check.checked = localStorage.getItem(BG_REMOVE_KEY) === '1'; } catch (e) {}
  check.onchange = () => {
    try { localStorage.setItem(BG_REMOVE_KEY, check.checked ? '1' : '0'); } catch (e) {}
  };
}

// Devuelve el blob a subir (recortado u original) o null si se cancela.
async function maybeRemoveBackground(blob) {
  setWinesEditorStatus('Quitando fondo… (unos segundos)');
  let cut;
  try {
    const fd = new FormData();
    fd.append('file', blob, 'foto');
    const r = await fetch('/api/photos/remove-bg', { method: 'POST', body: fd });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error === 'busy' ? 'el servidor está con otra foto' : (data.error || `HTTP ${r.status}`));
    }
    cut = await r.blob();
  } catch (e) {
    console.error(e);
    return confirm(`No se pudo quitar el fondo (${e.message}).\n\n¿Subir la foto original?`) ? blob : null;
  }
  return chooseBgVersion(blob, cut);
}

function chooseBgVersion(orig, cut) {
  const modal = document.getElementById('bg-modal');
  const origUrl = URL.createObjectURL(orig);
  const cutUrl = URL.createObjectURL(cut);
  document.getElementById('bg-orig').src = origUrl;
  document.getElementById('bg-cut').src = cutUrl;
  modal.classList.add('visible');
  return new Promise(resolve => {
    const done = choice => {
      modal.classList.remove('visible');
      modal.onclick = null;
      URL.revokeObjectURL(origUrl);
      URL.revokeObjectURL(cutUrl);
      resolve(choice);
    };
    document.getElementById('bg-use-orig').onclick = () => done(orig);
    document.getElementById('bg-use-cut').onclick = () => done(cut);
    modal.onclick = e => { if (e.target === modal) done(null); };
  });
}

function formatBytes(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

async function loadPhotos() {
  try {
    const r = await fetch('/api/photos', { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    const photos = data.photos || [];
    setupBgRemoveToggle(!!data.bg_remove);
    document.getElementById('photo-names').innerHTML =
      photos.map(p => `<option value="${escapeAttr(p.name)}"></option>`).join('');
    document.getElementById('photo-gallery-count').textContent = `(${photos.length})`;
    const gallery = document.getElementById('photo-gallery');
    if (!gallery.open) return;
    if (winesEditorLoaded) collectWinesEditorData();
    const used = new Set(winesEditorData.wines.map(w => w.photo).filter(Boolean));
    document.getElementById('photo-grid').innerHTML = photos.map(p => `
      <a class="photo-tile${used.has(p.name) ? ' used' : ''}" href="${photoUrl(p.name)}" target="_blank" rel="noopener">
        <img src="${photoUrl(p.name)}" alt="" loading="lazy">
        <span class="photo-tile-name">${escapeHtml(p.name)}</span>
        <span class="photo-tile-meta">${formatBytes(p.size)}${used.has(p.name) ? ' · en uso' : ''}</span>
      </a>`).join('') || '<div class="user-empty">No hay fotos.</div>';
  } catch (e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────
// WiFi admin
// ──────────────────────────────────────────
function setWifiStatus(msg, isError = false) {
  const el = document.getElementById('wifi-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function fillWifiForm(wifi) {
  document.getElementById('wifi-show').checked = !!(wifi && wifi.show);
  document.getElementById('wifi-ssid').value = wifi && wifi.ssid ? wifi.ssid : '';
  document.getElementById('wifi-password').value = wifi && wifi.password ? wifi.password : '';
}

async function loadWifiConfig(showMsg = true) {
  try {
    const data = await fetchWinesConfig();
    fillWifiForm(data.wifi || { show: false, ssid: '', password: '' });
    if (showMsg) setWifiStatus('Configuración WiFi cargada.');
  } catch (e) {
    console.error(e);
    setWifiStatus('No se pudo cargar WiFi.', true);
  }
}

async function saveWifiConfig() {
  try {
    const config = currentConfig || await fetchWinesConfig();
    config.wifi = {
      show: document.getElementById('wifi-show').checked,
      ssid: document.getElementById('wifi-ssid').value.trim(),
      password: document.getElementById('wifi-password').value,
    };
    const data = await saveWinesConfig(config);
    setWifiStatus('WiFi guardado. Si estás en bienvenida, la TV se actualizará.');
    showToast('Configuración WiFi guardada.');
    await fetchState();
  } catch (e) {
    console.error(e);
    setWifiStatus(`No se pudo guardar WiFi: ${e.message}`, true);
    showToast('No se pudo guardar WiFi', true);
  }
}

function bindWifiControls() {
  document.getElementById('btn-load-wifi').onclick = () => loadWifiConfig(true);
  document.getElementById('btn-save-wifi').onclick = saveWifiConfig;
}

// ──────────────────────────────────────────
// Invitados
// ──────────────────────────────────────────
function renderUsers() {
  const wrap = document.getElementById('user-list');
  const countEl = document.getElementById('users-count');
  if (!wrap) return;
  const users = state && state.users_public ? state.users_public : {};
  const entries = Object.entries(users);
  if (countEl) countEl.textContent = entries.length;
  wrap.innerHTML = '';
  if (!entries.length) {
    wrap.innerHTML = '<div class="user-empty">Aún no hay invitados registrados.</div>';
    return;
  }
  entries.forEach(([uid, u]) => {
    const hex = colorMap[u.color] || '#95A5A6';
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `<span class="user-dot" style="background:${hex}"></span><span class="user-name">${escapeHtml(u.name || '—')}</span><button class="user-del" title="Expulsar">✕</button>`;
    row.querySelector('.user-del').onclick = () => handleDeleteUser(uid, u.name || '');
    wrap.appendChild(row);
  });
}

async function handleDeleteUser(uid, name) {
  if (!confirm(`¿Expulsar a "${name || uid}"?\n\nSe borran su registro y todos sus votos. En su móvil se le forzará a registrarse de nuevo.`)) return;
  try {
    const r = await fetch('/api/me/' + encodeURIComponent(uid), { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast(`Invitado expulsado: ${name || uid}`);
      await fetchState();
    } else showToast(data.error || 'No se pudo expulsar', true);
  } catch (e) { showToast('Error de red', true); }
}

// ──────────────────────────────────────────
// Administración
// ──────────────────────────────────────────
function showToast(msg, isError) {
  const t = document.getElementById('archive-toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3500);
}

async function handleWipe() {
  if (!confirm('⚠️ MODO PRUEBAS ⚠️\n\n¿Borrar TODO sin guardar copia?\n\n• Todos los invitados\n• Todos los votos y comentarios\n• Vuelve a la pantalla de bienvenida\n\nNo se podrá recuperar nada.')) return;
  if (!confirm('Última oportunidad.\n\n¿De verdad borrar todo sin archivar?')) return;
  try {
    const r = await fetch('/api/votes/wipe', { method: 'POST' });
    const data = await r.json();
    showToast(data.status === 'ok' ? 'Todo borrado. Listo para empezar de cero.' : 'Error', data.status !== 'ok');
    await fetchState();
  } catch (e) { showToast('Error de red', true); }
}

async function handleVoteAlert() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch('/api/vote-alert', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    showToast(r.ok ? 'Aviso de voto enviado a la TV' : (data.error || 'No se pudo enviar el aviso'), !r.ok);
  } catch (e) {
    showToast('Error de red al enviar el aviso', true);
  } finally {
    busy = false;
  }
}

async function handleVoteAlertHide() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch('/api/vote-alert/hide', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    showToast(r.ok ? 'Aviso ocultado en la TV' : (data.error || 'No se pudo ocultar el aviso'), !r.ok);
  } catch (e) {
    showToast('Error de red al ocultar el aviso', true);
  } finally {
    busy = false;
  }
}

async function handlePrefAlert() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch('/api/pref-alert', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    showToast(r.ok ? 'Votación ¿Viejo o Nuevo? lanzada' : (data.error || 'No se pudo lanzar la votación'), !r.ok);
  } catch (e) {
    showToast('Error de red al lanzar la votación', true);
  } finally {
    busy = false;
  }
}

async function handleModeToggle() {
  if (busy || !state) return;
  busy = true;
  const turnOn = state.mode !== 'duelo';
  try {
    const r = await fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duelo: turnOn }),
    });
    const d = await r.json().catch(() => ({}));
    showToast(r.ok ? (turnOn ? '⚔️ Modo Duelo activado' : 'Modo Duelo desactivado') : (d.error || 'No se pudo cambiar el modo'), !r.ok);
    await fetchState();
  } catch (e) {
    showToast('Error de red al cambiar el modo', true);
  } finally {
    busy = false;
  }
}

async function handleQrToggle() {
  if (busy || !state) return;
  busy = true;
  const turnOn = !state.show_qr;
  try {
    const r = await fetch('/api/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: turnOn }),
    });
    const d = await r.json().catch(() => ({}));
    showToast(r.ok ? (turnOn ? '📱 QR visible en la TV' : 'QR oculto en la TV') : (d.error || 'No se pudo cambiar el QR'), !r.ok);
    await fetchState();
  } catch (e) {
    showToast('Error de red al cambiar el QR', true);
  } finally {
    busy = false;
  }
}

async function handleWelcomeBack() {
  if (!confirm('¿Volver a la pantalla de bienvenida?\n\nNo se pierde nada: los votos e invitados se mantienen.')) return;
  try {
    const r = await fetch('/api/welcome', { method: 'POST' });
    const data = await r.json();
    showToast(data.status === 'ok' ? 'Pantalla de bienvenida activada' : 'Error', data.status !== 'ok');
    await fetchState();
  } catch (e) { showToast('Error de red', true); }
}

async function handleClearVotes() {
  if (!confirm('¿Borrar TODOS los votos?\n\nLos invitados (nombres y colores) se mantendrán y podrán seguir votando desde cero.')) return;
  try {
    const r = await fetch('/api/votes/clear', { method: 'POST' });
    const data = await r.json();
    if (data.status === 'ok') showToast(`Votos borrados (${data.votes_cleared}). Invitados mantenidos (${data.users_kept}).`);
    else showToast('Error al limpiar votos', true);
    await fetchState();
  } catch (e) { showToast('Error de red', true); }
}

const archiveModal = document.getElementById('archive-modal');
const archiveNameInput = document.getElementById('archive-name');
const archiveConfirmBtn = document.getElementById('archive-confirm');
const archiveCancelBtn = document.getElementById('archive-cancel');

function openArchiveModal() {
  archiveNameInput.value = '';
  archiveModal.classList.add('visible');
  setTimeout(() => archiveNameInput.focus(), 100);
}

archiveCancelBtn.onclick = () => archiveModal.classList.remove('visible');
archiveConfirmBtn.onclick = async () => {
  const name = archiveNameInput.value.trim();
  archiveConfirmBtn.disabled = true;
  try {
    const r = await fetch('/api/votes/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await r.json();
    if (data.status === 'ok') {
      archiveModal.classList.remove('visible');
      showToast(`Archivado en ${data.archived_to} (${data.users_archived} invitados, ${data.votes_archived} votos). Todo reseteado.`);
      await fetchState();
    } else showToast(data.error || 'Error al archivar', true);
  } catch (e) { showToast('Error de red', true); }
  finally { archiveConfirmBtn.disabled = false; }
};
archiveModal.onclick = (e) => { if (e.target === archiveModal) archiveModal.classList.remove('visible'); };

function bindAdminControls() {
  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn) modeBtn.onclick = handleModeToggle;
  const qrBtn = document.getElementById('btn-qr-toggle');
  if (qrBtn) qrBtn.onclick = handleQrToggle;
  document.getElementById('btn-vote-alert').onclick = handleVoteAlert;
  document.getElementById('btn-vote-alert-hide').onclick = handleVoteAlertHide;
  const prefBtn = document.getElementById('btn-pref-alert');
  if (prefBtn) prefBtn.onclick = handlePrefAlert;
  document.getElementById('btn-welcome-back').onclick = handleWelcomeBack;
  document.getElementById('btn-clear-votes').onclick = handleClearVotes;
  document.getElementById('btn-archive').onclick = openArchiveModal;
  document.getElementById('btn-wipe').onclick = handleWipe;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// Igual que en app-core.js: parsea "Suckling 95 · Parker 92+" en pares {sys, sco}.
// Solo compatibilidad con el formato antiguo (rating string).
function parseRatingPairs(rating) {
  if (!rating || !String(rating).trim()) return [];
  return String(rating).split('·').map(s => s.trim()).filter(Boolean).map(seg => {
    const m = seg.match(/^(\S+)\s+(.+)$/);
    return m ? { sys: m[1], sco: m[2] } : { sys: '', sco: seg };
  });
}

// Puntuaciones de un vino como pares {sys, sco}. Prefiere wine.ratings=[{name,score}];
// cae al string legacy wine.rating si no existe.
function wineRatingPairs(wine) {
  if (wine && Array.isArray(wine.ratings)) {
    return wine.ratings
      .map(r => ({ sys: String((r && r.name) || '').trim(), sco: String((r && r.score) || '').trim() }))
      .filter(r => r.sys || r.sco);
  }
  return parseRatingPairs(wine && wine.rating);
}

// Puntuaciones para el editor: array de {name, score}. Convierte el legacy string.
function ratingsFromWine(wine) {
  if (wine && Array.isArray(wine.ratings)) {
    return wine.ratings
      .map(r => ({ name: String((r && r.name) || '').trim(), score: String((r && r.score) || '').trim() }))
      .filter(r => r.name || r.score);
  }
  return parseRatingPairs(wine && wine.rating).map(p => ({ name: p.sys, score: p.sco }));
}

fetchColorMap();
bindTabs();
bindWineEditorControls();
bindWifiControls();
bindAdminControls();
bindSummaryControls();
fetchState();
setInterval(fetchState, 3000);