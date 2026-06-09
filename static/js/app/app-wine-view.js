// ════════════════════════════════════════════════════════════════════════
// VISTA VINO INDIVIDUAL — layout y volcado de datos del vino actual
// ════════════════════════════════════════════════════════════════════════

function ensureLayout() {
  if (root.querySelector('.tv-frame')) return;
  root.innerHTML = `
    <div class="tv-frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
      <div class="tv-header">
        <div class="session-title" id="session-title">Cata</div>
        <div class="counter" id="counter">Vino — de —</div>
      </div>
      <div class="bottle-area" id="bottle-area">
        <img id="bottle" style="display:none" alt="">
        <div class="bottle-placeholder" id="bottle-placeholder"></div>
      </div>
      <div class="info-area" id="info-area">
        <div>
          <h1 class="wine-name" id="wine-name">—</h1>
          <p class="winery" id="winery">—</p>
        </div>
        <div class="meta hidden" id="meta">
          <span class="meta-system" id="meta-system"></span>
          <span class="meta-score" id="meta-score"></span>
        </div>
        <div class="wine-type hidden" id="wine-type"></div>
        <div class="tv-vote-pill" id="tv-vote-pill">
          <span class="tv-vote-stars" id="tv-vote-pill-stars">☆☆☆☆☆</span>
          <span class="tv-vote-value" id="tv-vote-pill-value">—</span>
          <span class="tv-vote-count" id="tv-vote-pill-count">Aún sin votos</span>
        </div>
        <div class="data-grid">
          <div class="data-row"><span class="data-label">Añada</span><span class="data-value" id="d-vintage">—</span></div>
          <div class="data-row"><span class="data-label">D.O.</span><span class="data-value" id="d-do">—</span></div>
          <div class="data-row"><span class="data-label">Uva</span><span class="data-value" id="d-grape">—</span></div>
          <div class="data-row"><span class="data-label">Región</span><span class="data-value" id="d-region">—</span></div>
        </div>
        <div class="vote-block" id="vote-block">
          <div class="vote-header">
            <div class="vote-user">
              <div class="vote-dot" id="vote-dot"></div>
              <div class="vote-user-name" id="vote-user-name">Tu voto</div>
            </div>
            <button class="vote-edit-btn" id="vote-edit-btn" style="display:none">Editar perfil</button>
          </div>
          <div class="vote-stars" id="vote-stars">
            <span class="vote-star" data-score="1">★</span>
            <span class="vote-star" data-score="2">★</span>
            <span class="vote-star" data-score="3">★</span>
            <span class="vote-star" data-score="4">★</span>
            <span class="vote-star" data-score="5">★</span>
          </div>
          <div class="vote-comment-wrap">
            <textarea class="vote-comment" id="vote-comment"
                      placeholder="Comentario (opcional) — escribe tranquilo y pulsa Enviar · máx 140 caracteres"
                      maxlength="140"></textarea>
            <button type="button" class="vote-comment-btn saved" id="vote-comment-btn" disabled>✓ Guardado</button>
          </div>
          <div class="vote-aggregate">
            <span class="vote-agg-label">La mesa</span>
            <span id="vote-aggregate-value"><span class="vote-agg-empty">Aún sin votos</span></span>
          </div>
        </div>
        <div class="curio hidden" id="curio">
          <div class="curio-mark">&ldquo;</div>
          <div class="curio-text" id="curio-text"></div>
        </div>
        <div class="map-container">
          <div class="map-label" id="map-label">—</div>
          <div id="map-inner"></div>
          <div class="map-outside-label" id="map-outside">—</div>
        </div>
      </div>
      <div class="tv-footer" id="dots"></div>
    </div>`;

  const ph = document.getElementById('bottle-placeholder');
  ph.innerHTML = document.getElementById('bottle-fallback').outerHTML.replace('display:none', '');
}

function applyUpdate(payload) {
  document.getElementById('session-title').textContent = payload.session || 'Cata';
  document.getElementById('counter').textContent = `Vino ${payload.index + 1} de ${payload.total}`;

  const w = payload.wine;

  const img = document.getElementById('bottle');
  const ph  = document.getElementById('bottle-placeholder');
  if (w.photo) {
    img.onload  = () => { img.style.display = ''; ph.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; ph.style.display = ''; };
    img.src = `/static/photos/${encodeURIComponent(w.photo)}`;
  } else {
    img.style.display = 'none';
    ph.style.display  = '';
  }

  document.getElementById('wine-name').textContent = w.name || '—';
  document.getElementById('winery').textContent    = w.winery || '—';
  document.getElementById('d-vintage').textContent = w.vintage || '—';
  document.getElementById('d-do').textContent      = w.do || '—';
  document.getElementById('d-grape').textContent   = w.grape || '—';
  document.getElementById('d-region').textContent  = w.region || w.do || '—';

  // Tipo de vino: chip arriba-derecha en TV, acento de color en el borde de
  // la tarjeta en móvil. El data-wine-type va en el marco para que la variable
  // de color (--wine-type-color) llegue tanto al chip como a la tarjeta.
  const wineTypeEl = document.getElementById('wine-type');
  const frameEl = root.querySelector('.tv-frame');
  const wineType = WINE_TYPE_LABELS[w.type] ? w.type : '';
  if (wineType) {
    if (frameEl) frameEl.dataset.wineType = wineType;
    if (wineTypeEl) {
      wineTypeEl.textContent = WINE_TYPE_LABELS[wineType];
      wineTypeEl.classList.remove('hidden');
    }
  } else {
    if (frameEl) frameEl.removeAttribute('data-wine-type');
    if (wineTypeEl) wineTypeEl.classList.add('hidden');
  }

  // Meta: solo puntuación (precio se ignora, queda en JSON pero oculto)
  const meta       = document.getElementById('meta');
  const metaSystem = document.getElementById('meta-system');
  const metaScore  = document.getElementById('meta-score');
  const hasRating  = w.rating && String(w.rating).trim();
  if (hasRating) {
    const m = String(w.rating).match(/^(\S+)\s+(.+)$/);
    if (m) {
      metaSystem.textContent = m[1];
      metaScore.textContent  = m[2];
    } else {
      metaSystem.textContent = '';
      metaScore.textContent  = w.rating;
    }
    meta.classList.remove('hidden');
  } else {
    meta.classList.add('hidden');
  }

  const curio     = document.getElementById('curio');
  const curioText = document.getElementById('curio-text');
  if (w.curiosity && w.curiosity.trim()) {
    curioText.textContent = w.curiosity;
    curio.classList.remove('hidden');
  } else {
    curio.classList.add('hidden');
  }

  const mapLabel = document.getElementById('map-label');
  const mapOutside = document.getElementById('map-outside');

  if (w.coords && Array.isArray(w.coords) && w.coords.length === 2) {
    const [lat, lon] = w.coords;
    const mapKey = renderMap(lat, lon);
    if (mapKey) {
      mapOutside.classList.remove('visible');
    } else {
      // Vino fuera de los 4 mapas — mostrar etiqueta de internacional
      mapOutside.textContent = w.region || w.do || 'Internacional';
      mapOutside.classList.add('visible');
    }
    //mapLabel.textContent = w.do || w.region || 'Región';    
    const mapDisplayLabel =
      mapKey && MAPS_DATA && MAPS_DATA[mapKey] && MAPS_DATA[mapKey].label
        ? MAPS_DATA[mapKey].label
        : (w.do || w.region || 'Región');

    mapLabel.textContent = mapDisplayLabel;
  } else {
    mapLabel.textContent = w.do || '—';
    renderMap(null, null);
    mapOutside.classList.remove('visible');
  }

  const serverIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.index;
  const mobile = isMobile();
  const dots = document.getElementById('dots');
  dots.innerHTML = '';
  for (let i = 0; i < payload.total; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    if (i < payload.index)        d.classList.add('done');
    else if (i === payload.index) d.classList.add('active');
    if (i > serverIdx) {
      d.classList.add('locked');
    } else if (mobile && i !== payload.index) {
      d.classList.add('clickable');
      d.onclick = () => navigateTo(i);
    }
    dots.appendChild(d);
  }
  // Si el server está en el resumen, añadir el dot del resumen (sólo móvil clicable)
  if (serverIdx === payload.total) {
    const d = document.createElement('div');
    d.className = 'dot summary' + (mobile ? ' clickable' : '');
    if (mobile) d.onclick = () => navigateTo(payload.total);
    dots.appendChild(d);
  }
}
