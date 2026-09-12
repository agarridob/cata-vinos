// ════════════════════════════════════════════════════════════════════════
// VISTA DUELO — modo "Viejo Mundo vs Nuevo Mundo" (SOLO TV)
// Una pantalla por uva: cabecera + dos columnas (Viejo izq / Nuevo der) +
// mapamundi "de 1 a 2" abajo. Carga tras app-wine-view. Comparte scope global.
// La pareja k son los vinos 2k (Viejo) y 2k+1 (Nuevo). El móvil NO usa esto:
// sigue con la vista de vino individual (voto secuencial).
// ════════════════════════════════════════════════════════════════════════

const DUEL_WORLD_LABEL = { viejo: '🌍 Viejo Mundo', nuevo: '🌎 Nuevo Mundo' };

function duelSideOf(wine, fallbackIdx) {
  if (wine && (wine.world === 'viejo' || wine.world === 'nuevo')) return wine.world;
  // Fallback por posición: par = Viejo, impar = Nuevo.
  return (fallbackIdx % 2 === 0) ? 'viejo' : 'nuevo';
}

function duelColumnHtml(wine, side, isCurrent) {
  const typeLabel = WINE_TYPE_LABELS[wine.type] || '';
  const ratingPairs = wineRatingPairs(wine);
  const ratingsHtml = ratingPairs.length
    ? '<div class="duel-meta">' + ratingPairs.map(p =>
        `<span class="duel-meta-pair">${p.sys ? `<span class="duel-meta-sys">${escapeHtml(p.sys)}</span>` : ''}<span class="duel-meta-score">${escapeHtml(p.sco)}</span></span>`
      ).join('<span class="duel-meta-sep">·</span>') + '</div>'
    : '';
  const note = (wine.duel_note && wine.duel_note.trim()) || (wine.curiosity && wine.curiosity.trim()) || '';
  const noteHtml = note ? `<div class="duel-note">${escapeHtml(note)}</div>` : '';

  const photoHtml = wine.photo
    ? `<img class="duel-img" src="/static/photos/${encodeURIComponent(wine.photo)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
       <div class="duel-img-ph" style="display:none">🍷</div>`
    : `<div class="duel-img-ph" style="display:flex">🍷</div>`;

  const dataRows = [
    ['Uva', wine.grape],
    ['Añada', wine.vintage],
    ['Región', wine.region || wine.do],
    ['D.O.', wine.do],
  ].filter(([, v]) => v && String(v).trim())
   .map(([k, v]) => `<div class="duel-data-row"><span class="duel-data-k">${k}</span><span class="duel-data-v">${escapeHtml(String(v))}</span></div>`)
   .join('');

  return `
    <div class="duel-col duel-${side} ${isCurrent ? 'is-current' : ''}" data-wine-type="${typeLabel ? escapeHtml(wine.type) : ''}">
      <div class="duel-now">🍷 En tu copa ahora</div>
      <div class="duel-flag">${DUEL_WORLD_LABEL[side]}</div>
      <div class="duel-bottle">${photoHtml}</div>
      <h2 class="duel-name">${escapeHtml(wine.name || '—')}</h2>
      <div class="duel-winery">${escapeHtml(wine.winery || '')}</div>
      ${typeLabel ? `<div class="duel-type">${typeLabel}</div>` : ''}
      ${ratingsHtml}
      <div class="duel-data">${dataRows}</div>
      ${noteHtml}
    </div>`;
}

function duelPrefBarHtml(pairSummary) {
  const v = (pairSummary && pairSummary.viejo) || 0;
  const n = (pairSummary && pairSummary.nuevo) || 0;
  const total = v + n;
  const vp = total ? Math.round(v / total * 100) : 50;
  const np = total ? 100 - vp : 50;
  const empty = total === 0;
  return `
    <div class="duel-pref-title">${empty ? '¿Cuál te gusta más? — aún sin votos' : 'La mesa vota'}</div>
    <div class="duel-pref-bar ${empty ? 'is-empty' : ''}">
      <div class="duel-pref-fill viejo" style="width:${vp}%"><span>🌍 ${v}</span></div>
      <div class="duel-pref-fill nuevo" style="width:${np}%"><span>${n} 🌎</span></div>
    </div>`;
}

// Devuelve true si pintó el duelo; false si no pudo (para que app-core caiga a
// la vista de vino individual como salvaguarda).
function renderDuel(payload, pairIdx) {
  const wines = payload.all_wines || [];
  const iA = pairIdx * 2, iB = pairIdx * 2 + 1;
  const wA = wines[iA], wB = wines[iB];
  if (!wA || !wB) return false;

  const sideA = duelSideOf(wA, iA);
  const sideB = duelSideOf(wB, iB);
  // Columna izquierda = Viejo, derecha = Nuevo (según el boceto).
  let viejo, nuevo, viejoIdx, nuevoIdx;
  if (sideA === 'viejo') { viejo = wA; viejoIdx = iA; nuevo = wB; nuevoIdx = iB; }
  else                   { viejo = wB; viejoIdx = iB; nuevo = wA; nuevoIdx = iA; }

  const grape = (viejo.duel && viejo.duel.trim()) || (nuevo.duel && nuevo.duel.trim())
    || (viejo.grape && viejo.grape.trim()) || 'Duelo';

  const nPairs = (payload.pair_votes_summary && payload.pair_votes_summary.n_pairs)
    || Math.floor((payload.total || wines.length) / 2);

  const curIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.index;
  const pairSummary = payload.pair_votes_summary
    && payload.pair_votes_summary.pairs
    && payload.pair_votes_summary.pairs[String(pairIdx)];

  const existing = root.querySelector('.duel-frame');
  const samePair = existing && existing.dataset.pair === String(pairIdx);

  if (!samePair) {
    // (Re)construcción completa al cambiar de pareja.
    root.innerHTML = `
      <div class="duel-frame" data-pair="${pairIdx}">
        <div class="corner tl"></div><div class="corner tr"></div>
        <div class="corner bl"></div><div class="corner br"></div>
        <div class="duel-header">
          <div class="duel-session" id="duel-session">${escapeHtml(payload.session || 'Cata')}</div>
          <h1 class="duel-grape" id="duel-grape">${escapeHtml(grape)}</h1>
          <div class="duel-counter" id="duel-counter">Uva ${pairIdx + 1} de ${nPairs}</div>
        </div>
        <div class="duel-body">
          <div class="duel-cols" id="duel-cols"></div>
          <div class="duel-vs">VS</div>
        </div>
        <div class="duel-pref" id="duel-pref"></div>
        <div class="duel-map" id="duel-map"></div>
        <div class="tv-footer" id="dots"></div>
      </div>`;

    document.getElementById('duel-cols').innerHTML =
      duelColumnHtml(viejo, 'viejo', viejoIdx === curIdx) +
      duelColumnHtml(nuevo, 'nuevo', nuevoIdx === curIdx);

    // Mapamundi (estático por pareja).
    document.getElementById('duel-map').innerHTML =
      buildWorldMapSVG(viejo.coords, nuevo.coords);
  } else {
    // Misma pareja: solo refrescar el resaltado del vino actual.
    const cols = root.querySelectorAll('.duel-col');
    if (cols[0]) cols[0].classList.toggle('is-current', viejoIdx === curIdx);
    if (cols[1]) cols[1].classList.toggle('is-current', nuevoIdx === curIdx);
  }

  // Barra de preferencia: se actualiza siempre (llega por SSE en cada voto).
  const prefEl = document.getElementById('duel-pref');
  if (prefEl) prefEl.innerHTML = duelPrefBarHtml(pairSummary);

  // Dots de progreso (por vino, como en la vista normal).
  renderDuelDots(payload);
  return true;
}

function renderDuelDots(payload) {
  const dots = document.getElementById('dots');
  if (!dots) return;
  const serverIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.index;
  dots.innerHTML = '';
  for (let i = 0; i < payload.total; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    if (i < payload.index) d.classList.add('done');
    else if (i === payload.index) d.classList.add('active');
    if (i > serverIdx) d.classList.add('locked');
    dots.appendChild(d);
  }
}
