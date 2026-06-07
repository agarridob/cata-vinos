let state = null;
let busy = false;
let colorMap = {};   // key -> hex, para pintar las bolitas de color de los invitados

async function fetchColorMap() {
  try {
    const r = await fetch('/api/colors', { cache: 'no-store' });
    const colors = await r.json();
    colorMap = {};
    colors.forEach(c => { colorMap[c.key] = c.hex; });
  } catch (e) {
    // sin mapa, las bolitas saldrán en gris por defecto
  }
}

async function fetchState() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    state = await r.json();
    render();
  } catch (e) {
    console.error(e);
  }
}

async function go(action) {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch(`/api/${action}`, { method: 'POST' });
    state = await r.json();
    render();
  } catch (e) {
    console.error(e);
  } finally {
    busy = false;
  }
}

async function gotoIdx(i) {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch(`/api/goto/${i}`, { method: 'POST' });
    state = await r.json();
    render();
  } catch (e) {
    console.error(e);
  } finally {
    busy = false;
  }
}

async function reload() {
  if (busy) return;
  busy = true;
  try {
    await fetch('/api/reload', { method: 'POST' });
    await fetchState();
  } finally {
    busy = false;
  }
}

function render() {
  const content = document.getElementById('content');
  if (!state || (state.total === 0)) {
    content.innerHTML = `
      <div class="empty">
        Sin vinos cargados.<br><br>
        <button class="btn" onclick="reload()" style="display:inline-block;padding:14px 28px">Recargar</button>
      </div>`;
    return;
  }

  // ─── Card superior: vino actual o "Resumen" ───
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
    // Meta (solo puntuación, precio queda oculto)
    let metaHtml = '';
    const hasRating = state.wine.rating && String(state.wine.rating).trim();
    if (hasRating) {
      const m = String(state.wine.rating).match(/^(\S+)\s+(.+)$/);
      if (m) {
        metaHtml = `<div class="current-meta"><span class="current-meta-system">${escapeHtml(m[1])}</span><span class="current-meta-score">${escapeHtml(m[2])}</span></div>`;
      } else {
        metaHtml = `<div class="current-meta"><span class="current-meta-score">${escapeHtml(state.wine.rating)}</span></div>`;
      }
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

  // ─── Botones prev/next ───
  // En welcome: prev oculto, next = "Empezar la cata"
  // Anterior: deshabilitado si estamos en el primer vino (idx==0), no se muestra en welcome
  // Siguiente: deshabilitado si ya estamos en el resumen (idx == total)
  let prevDisabled, nextDisabled, nextLabel, prevLabel;
  if (state.is_welcome) {
    prevDisabled = true;
    nextDisabled = false;
    prevLabel = '◀ Anterior';
    nextLabel = '▶ Empezar la cata';
  } else {
    prevDisabled = state.index <= 0;
    nextDisabled = state.index >= state.total;
    prevLabel = '◀ Anterior';
    nextLabel = (state.index === state.total - 1) ? 'Ir a resumen ▶' : 'Siguiente ▶';
  }

  content.innerHTML = `
    ${cardHtml}

    <div class="buttons">
      <button class="btn" id="btn-prev" ${prevDisabled ? 'disabled' : ''}>${prevLabel}</button>
      <button class="btn ${state.is_welcome ? 'btn-primary-start' : ''}" id="btn-next" ${nextDisabled ? 'disabled' : ''}>${nextLabel}</button>
    </div>

    <div class="list-title">Carta de la velada</div>
    <div class="wine-list" id="list"></div>

    <div class="footer">
      <button onclick="reload()">↻ Recargar wines.json</button>
    </div>

    <div class="admin-section">
      <div class="admin-title">Administración</div>
      <button class="admin-btn admin-btn-warn" id="btn-welcome-back" ${state.is_welcome ? 'disabled style="opacity:0.4"' : ''}>
        <span class="admin-btn-label">Volver a la pantalla de bienvenida</span>
        <span class="admin-btn-sub">Sin tocar votos ni invitados</span>
      </button>
      <button class="admin-btn admin-btn-warn" id="btn-clear-votes">
        <span class="admin-btn-label">Limpiar votos</span>
        <span class="admin-btn-sub">Borra los votos, mantiene los invitados</span>
      </button>
      <button class="admin-btn admin-btn-danger" id="btn-archive">
        <span class="admin-btn-label">Archivar y reiniciar</span>
        <span class="admin-btn-sub">Guarda copia y vuelve a bienvenida (votos + invitados)</span>
      </button>
    </div>

    <div class="admin-section">
      <div class="admin-title">Invitados (<span id="users-count">0</span>)</div>
      <div class="user-list" id="user-list"></div>
    </div>

    <div class="admin-section admin-test-section">
      <div class="admin-title admin-test-title">Pruebas</div>
      <button class="admin-btn admin-btn-test" id="btn-wipe">
        <span class="admin-btn-label">Borrar todo</span>
        <span class="admin-btn-sub">Sin archivar nada. Como si no hubiera pasado nada.</span>
      </button>
    </div>
  `;

  document.getElementById('btn-prev').onclick = () => go('prev');
  document.getElementById('btn-next').onclick = () => go('next');
  document.getElementById('btn-welcome-back').onclick = handleWelcomeBack;
  document.getElementById('btn-clear-votes').onclick = handleClearVotes;
  document.getElementById('btn-archive').onclick = openArchiveModal;
  document.getElementById('btn-wipe').onclick = handleWipe;

  const list = document.getElementById('list');

  // Vinos uno por uno
  state.all_titles.forEach((w, i) => {
    const item = document.createElement('div');
    item.className = 'wine-item';
    if (i === state.index)      item.classList.add('active');
    else if (i < state.index)   item.classList.add('done');
    item.innerHTML = `
      <div class="wine-num">${i + 1}</div>
      <div class="wine-info">
        <div class="wine-item-name">${escapeHtml(w.name || '—')}</div>
        <div class="wine-item-winery">${escapeHtml(w.winery || '—')}</div>
      </div>
    `;
    item.onclick = () => gotoIdx(i);
    list.appendChild(item);
  });

  // Entrada extra "Resumen" al final
  const summary = document.createElement('div');
  summary.className = 'wine-item summary-item';
  if (state.is_summary) summary.classList.add('active');
  summary.innerHTML = `
    <div class="wine-num">∑</div>
    <div class="wine-info">
      <div class="wine-item-name">Resumen</div>
      <div class="wine-item-winery">${state.total} vinos · final</div>
    </div>
  `;
  summary.onclick = () => gotoIdx(state.total);
  list.appendChild(summary);

  renderUsers();
}


// ──────────────────────────────────────────
// Editor visual de vinos
// ──────────────────────────────────────────
let winesEditorLoaded = false;
let winesEditorData = { session: '', wifi: null, wines: [] };

function setWinesEditorStatus(msg, isError = false) {
  const el = document.getElementById('wines-editor-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function emptyWine() {
  return {
    name: '', winery: '', vintage: '', do: '', grape: '', region: '',
    rating: '', curiosity: '', photo: '', coords: ['', '']
  };
}

function normalizeWineForEditor(w) {
  const out = emptyWine();
  ['name','winery','vintage','do','grape','region','rating','curiosity','photo'].forEach(k => {
    out[k] = w && w[k] != null ? String(w[k]) : '';
  });
  if (w && Array.isArray(w.coords) && w.coords.length === 2) {
    out.coords = [
      w.coords[0] != null ? String(w.coords[0]) : '',
      w.coords[1] != null ? String(w.coords[1]) : '',
    ];
  }
  return out;
}

async function loadWinesEditor() {
  setWinesEditorStatus('Cargando carta…');
  try {
    const r = await fetch('/api/wines-config', { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
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
  if (!sessionInput || !list) return;
  if (!winesEditorLoaded) return;

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
  return `<label class="editor-label">${label}
    <input class="editor-input" data-field="${field}" value="${escapeAttr(value || '')}">
  </label>`;
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildWinesEditorPayload() {
  collectWinesEditorData();
  return {
    session: winesEditorData.session,
    wifi: winesEditorData.wifi,
    wines: winesEditorData.wines.map(w => {
      const out = {
        name: w.name || '', winery: w.winery || '', vintage: w.vintage || '',
        do: w.do || '', grape: w.grape || '', region: w.region || '',
        rating: w.rating || '', curiosity: w.curiosity || '', photo: w.photo || '',
      };
      const lat = String(w.coords?.[0] || '').trim();
      const lon = String(w.coords?.[1] || '').trim();
      if (lat !== '' && lon !== '') out.coords = [Number(lat), Number(lon)];
      return out;
    }),
  };
}

async function saveWinesEditor() {
  if (!winesEditorLoaded) {
    showToast('Primero carga el editor.', true);
    return;
  }
  if (!confirm('¿Guardar los cambios en wines.json y refrescar la TV?')) return;
  setWinesEditorStatus('Guardando carta…');
  try {
    const r = await fetch('/api/wines-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildWinesEditorPayload()),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
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

let wineEditorControlsBound = false;

function bindWineEditorControls() {
  if (wineEditorControlsBound) return;
  wineEditorControlsBound = true;

  const loadBtn = document.getElementById('btn-load-editor');
  const addBtn = document.getElementById('btn-add-editor-wine');
  const saveBtn = document.getElementById('btn-save-editor');
  const list = document.getElementById('wines-editor-list');

  if (loadBtn) loadBtn.onclick = loadWinesEditor;
  if (addBtn) addBtn.onclick = addEditorWine;
  if (saveBtn) saveBtn.onclick = saveWinesEditor;
  if (list) list.onclick = handleEditorAction;
}

// ──────────────────────────────────────────
// Panel de invitados: listar y expulsar
// ──────────────────────────────────────────
function renderUsers() {
  const wrap = document.getElementById('user-list');
  const countEl = document.getElementById('users-count');
  if (!wrap) return;
  const users = (state && state.users_public) ? state.users_public : {};
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
    row.innerHTML = `
      <span class="user-dot" style="background:${hex}"></span>
      <span class="user-name">${escapeHtml(u.name || '—')}</span>
      <button class="user-del" title="Expulsar">✕</button>`;
    row.querySelector('.user-del').onclick = () => handleDeleteUser(uid, u.name || '');
    wrap.appendChild(row);
  });
}

async function handleDeleteUser(uid, name) {
  if (!confirm(`¿Expulsar a "${name || uid}"?\n\nSe borran su registro y todos sus votos. En su móvil se le forzará a registrarse de nuevo.`)) {
    return;
  }
  try {
    const r = await fetch('/api/me/' + encodeURIComponent(uid), { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast(`Invitado expulsado: ${name || uid}`);
      await fetchState();   // refresca la lista de inmediato
    } else {
      showToast(data.error || 'No se pudo expulsar', true);
    }
  } catch (e) {
    showToast('Error de red', true);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ──────────────────────────────────────────
// Administración: clear votes + archive
// ──────────────────────────────────────────
function showToast(msg, isError) {
  const t = document.getElementById('archive-toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3500);
}

async function handleWipe() {
  if (!confirm('⚠️ MODO PRUEBAS ⚠️\n\n¿Borrar TODO sin guardar copia?\n\n• Todos los invitados\n• Todos los votos y comentarios\n• Vuelve a la pantalla de bienvenida\n\nNo se podrá recuperar nada.')) {
    return;
  }
  if (!confirm('Última oportunidad.\n\n¿De verdad borrar todo sin archivar?')) {
    return;
  }
  try {
    const r = await fetch('/api/votes/wipe', { method: 'POST' });
    const data = await r.json();
    if (data.status === 'ok') {
      showToast('Todo borrado. Listo para empezar de cero.');
    } else {
      showToast('Error', true);
    }
  } catch (e) {
    showToast('Error de red', true);
  }
}

async function handleWelcomeBack() {
  if (!confirm('¿Volver a la pantalla de bienvenida?\n\nNo se pierde nada: los votos e invitados se mantienen. La pantalla TV mostrará el QR otra vez.')) {
    return;
  }
  try {
    const r = await fetch('/api/welcome', { method: 'POST' });
    const data = await r.json();
    if (data.status === 'ok') {
      showToast('Pantalla de bienvenida activada');
    } else {
      showToast('Error', true);
    }
  } catch (e) {
    showToast('Error de red', true);
  }
}

async function handleClearVotes() {
  if (!confirm('¿Borrar TODOS los votos?\n\nLos invitados (nombres y colores) se mantendrán y podrán seguir votando desde cero.')) {
    return;
  }
  try {
    const r = await fetch('/api/votes/clear', { method: 'POST' });
    const data = await r.json();
    if (data.status === 'ok') {
      showToast(`Votos borrados (${data.votes_cleared}). Invitados mantenidos (${data.users_kept}).`);
    } else {
      showToast('Error al limpiar votos', true);
    }
  } catch (e) {
    showToast('Error de red', true);
  }
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
    const r = await fetch('/api/votes/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name }),
    });
    const data = await r.json();
    if (data.status === 'ok') {
      archiveModal.classList.remove('visible');
      showToast(`Archivado en ${data.archived_to} (${data.users_archived} invitados, ${data.votes_archived} votos). Todo reseteado.`);
    } else {
      showToast(data.error || 'Error al archivar', true);
    }
  } catch (e) {
    showToast('Error de red', true);
  } finally {
    archiveConfirmBtn.disabled = false;
  }
};

archiveModal.onclick = (e) => {
  if (e.target === archiveModal) archiveModal.classList.remove('visible');
};

fetchColorMap();
bindWineEditorControls();
fetchState();
setInterval(fetchState, 3000);
