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
    const hasRating = state.wine.rating && String(state.wine.rating).trim();
    if (hasRating) {
      const m = String(state.wine.rating).match(/^(\S+)\s+(.+)$/);
      metaHtml = m
        ? `<div class="current-meta"><span class="current-meta-system">${escapeHtml(m[1])}</span><span class="current-meta-score">${escapeHtml(m[2])}</span></div>`
        : `<div class="current-meta"><span class="current-meta-score">${escapeHtml(state.wine.rating)}</span></div>`;
    }
    cardHtml = `
      <div class="current-card">
        <div class="current-label">Sirviendo ahora</div>
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
  return { name: '', winery: '', vintage: '', do: '', grape: '', region: '', rating: '', curiosity: '', photo: '', type: '', coords: ['', ''] };
}

function normalizeWineForEditor(w) {
  const out = emptyWine();
  ['name','winery','vintage','do','grape','region','rating','curiosity','photo','type'].forEach(k => {
    out[k] = w && w[k] != null ? String(w[k]) : '';
  });
  if (w && Array.isArray(w.coords) && w.coords.length === 2) {
    out.coords = [w.coords[0] != null ? String(w.coords[0]) : '', w.coords[1] != null ? String(w.coords[1]) : ''];
  }
  return out;
}

async function loadWinesEditor() {
  setWinesEditorStatus('Cargando carta…');
  try {
    const data = await fetchWinesConfig();
    winesEditorData = {
      session: data.session || '',
      wifi: data.wifi || null,
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
        ${editorField('Rating', 'rating', w.rating)}
        ${editorField('Foto', 'photo', w.photo)}
        ${editorField('Latitud', 'lat', w.coords[0])}
        ${editorField('Longitud', 'lon', w.coords[1])}
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

const WINE_TYPE_OPTIONS = [
  ['', '— sin definir —'],
  ['tinto', 'Tinto'],
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
    wines: winesEditorData.wines.map(w => {
      const out = { name: w.name || '', winery: w.winery || '', vintage: w.vintage || '', do: w.do || '', grape: w.grape || '', region: w.region || '', rating: w.rating || '', curiosity: w.curiosity || '', photo: w.photo || '', type: w.type || '' };
      const lat = String(w.coords?.[0] || '').trim();
      const lon = String(w.coords?.[1] || '').trim();
      if (lat !== '' && lon !== '') out.coords = [Number(lat), Number(lon)];
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

function handleEditorAction(e) {
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
  document.getElementById('wines-editor-list').onclick = handleEditorAction;
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

async function handleWelcomeBack() {
  if (!confirm('¿Volver a la pantalla de bienvenida?\n\nNo se pierde nada: los votos e invitados se mantienen. La pantalla TV mostrará el QR otra vez.')) return;
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
  document.getElementById('btn-welcome-back').onclick = handleWelcomeBack;
  document.getElementById('btn-clear-votes').onclick = handleClearVotes;
  document.getElementById('btn-archive').onclick = openArchiveModal;
  document.getElementById('btn-wipe').onclick = handleWipe;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

fetchColorMap();
bindTabs();
bindWineEditorControls();
bindWifiControls();
bindAdminControls();
bindSummaryControls();
fetchState();
setInterval(fetchState, 3000);