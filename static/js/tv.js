const root = document.getElementById('root');
let currentSig = null;
// Instancia Leaflet (mapa móvil). Leaflet no permite re-inicializar el mismo div,
// así que reutilizamos la instancia y solo recolocamos la vista/marcador.
let leafletMap = null;
let leafletMarker = null;

// 4 mapas regionales (Iberia, Francia, Italia, Alemania)
// Ahora se cargan desde /static/maps/maps_data.json para no meter el JSON gigante en el HTML.
let MAPS_DATA = null;

const SUMMARY_ROTATE_MS = 30000;

let summaryViewTimer = null;
let summaryLocalView = 'cards'; // 'cards' | 'journey'

async function loadMapsData() {
  try {
    const res = await fetch('/static/maps/maps_data.json');

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    MAPS_DATA = await res.json();
  } catch (err) {
    console.error('Error cargando MAPS_DATA:', err);
    MAPS_DATA = {};
  }
}

function pickMap(lat, lon) {
  // Canarias: Lanzarote, Tenerife, Gran Canaria, etc.
  // Importante: va antes de Iberia porque Canarias está fuera del bbox peninsular.
  if (lon >= -18.5 && lon <= -13.0 && lat >= 27.5 && lat <= 29.6) return 'canaries';
  // Iberia peninsular
  if (lon >= -10 && lon <= 4 && lat >= 35 && lat <= 44) return 'iberia';
  if (lon >= 6.5 && lon <= 19 && lat >= 36 && lat <= 47) return 'italy';
  if (lon >= 5.5 && lon <= 16 && lat >= 47.5 && lat <= 55) return 'germany';
  if (lon >= -5 && lon <= 8 && lat >= 41 && lat <= 51) return 'france';

  return null;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getZoomedViewBox(x, y, w, h, zoom = 1.65) {
  const viewW = w / zoom;
  const viewH = h / zoom;

  const minX = clamp(x - viewW / 2, 0, Math.max(0, w - viewW));
  const minY = clamp(y - viewH / 2, 0, Math.max(0, h - viewH));

  return `${minX} ${minY} ${viewW} ${viewH}`;
}
function renderMap(lat, lon) {
  const cont = document.getElementById('map-inner');
  if (!cont) return null;
  if (lat == null || lon == null) {
    cont.innerHTML = '';
    leafletMap = null; leafletMarker = null;
    return null;
  }

  // En móvil: mapa Leaflet con tiles de OpenStreetMap teñidos en sepia/papel cálido,
  // para que combine con la paleta crema/dorado/burdeos de la web.
  if (isMobile()) {
    // Si el contenedor fue recreado (cambio de vista), la instancia vieja ya no sirve.
    let host = document.getElementById('map-leaflet');
    if (!host || !cont.contains(host)) {
      cont.innerHTML = '<div id="map-leaflet"></div>';
      host = document.getElementById('map-leaflet');
      leafletMap = null; leafletMarker = null;
    }

    const pinIcon = L.divIcon({
      className: '',
      html: '<div class="map-pin-pulse"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    if (!leafletMap) {
      leafletMap = L.map(host, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
      }).setView([lat, lon], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(leafletMap);
      leafletMarker = L.marker([lat, lon], { icon: pinIcon }).addTo(leafletMap);
      // El contenedor puede no tener tamaño aún al crearse; recalcular tras el layout.
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 60);
    } else {
      leafletMap.setView([lat, lon], 5, { animate: true });
      if (leafletMarker) {
        leafletMarker.setLatLng([lat, lon]);
      } else {
        leafletMarker = L.marker([lat, lon], { icon: pinIcon }).addTo(leafletMap);
      }
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 60);
    }
    return 'leaflet';  // truthy: Leaflet cubre todo el mundo, nunca "internacional" en móvil
  }

  // TV/desktop: SVG regional con pin (Iberia, Francia, Italia, Alemania)
  leafletMap = null; leafletMarker = null;
  const key = pickMap(lat, lon);
  if (!key || !MAPS_DATA || !MAPS_DATA[key]) {
    cont.innerHTML = '';
    return null;
  }
  
  const regionRadius = key === 'canaries' ? 34 : 42;

  const m = MAPS_DATA[key];
  const [lonMin, lonMax, latMin, latMax] = m.bbox;
  const [w, h] = m.size;

  const x = (lon - lonMin) / (lonMax - lonMin) * w;
  const y = (latMax - lat) / (latMax - latMin) * h;

  // Zoom dinámico solo en TV/desktop.
  // En móvil seguimos usando Leaflet.
  const zoom = m.zoom || 1.65;
  const viewBox = getZoomedViewBox(x, y, w, h, zoom);


  cont.innerHTML = `
    <svg
      id="map-svg"
      class="map-svg-zoomed"
      viewBox="${viewBox}"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect class="sea" x="0" y="0" width="${w}" height="${h}"></rect>

      <path class="country" d="${m.path}"></path>

      <g id="map-pin" class="visible" transform="translate(${x} ${y})">
        <circle class="map-region-glow" cx="0" cy="0" r="${regionRadius}"></circle>
        <circle class="map-focus-ring" cx="0" cy="0" r="28"></circle>
        <circle class="pulse" cx="0" cy="0" r="7"></circle>
        <circle class="dot" cx="0" cy="0" r="4.8"></circle>
      </g>
    </svg>
  `;

  return key;
}

/**
 * Devuelve un array con cuántos vinos van en cada fila del resumen,
 * según el total. Sigue la heurística del usuario:
 *  6→[3,3], 7→[2,3,2], 8→[3,2,3], 9→[3,3,3], 10→[3,4,3]...
 */
function getSummaryLayout(n) {
  const fixed = {
    1: [1], 2: [2], 3: [3],
    4: [2, 2], 5: [2, 3],
    6: [3, 3], 7: [2, 3, 2], 8: [3, 2, 3],
    9: [3, 3, 3], 10: [3, 4, 3], 11: [4, 3, 4],
    12: [4, 4, 4],
  };
  if (fixed[n]) return fixed[n];
  // Fallback: 4 filas lo más uniformes posible para n >= 13
  const rows = 4;
  const base = Math.floor(n / rows);
  let extra = n - base * rows;
  // Empezamos uniformes y vamos sumando 1 a las filas centrales mientras quede
  const out = new Array(rows).fill(base);
  // Reparte el extra empezando por el centro (rows/2) hacia los lados
  const order = [];
  const mid = Math.floor((rows - 1) / 2);
  for (let i = 0; i < rows; i++) {
    order.push(mid + (i % 2 === 0 ? i / 2 : -Math.ceil(i / 2)));
  }
  for (const i of order) {
    if (extra <= 0) break;
    out[i] += 1; extra -= 1;
  }
  return out;
}

function renderEmpty(sessionName) {
  root.innerHTML = `
    <div class="empty-state">
      <h1>In Vino Veritas</h1>
      <p>${sessionName ? sessionName + ' · ' : ''}Esperando vinos…</p>
    </div>`;
  currentSig = '__empty__';
}

function renderWelcome(payload) {
  const mobile = isMobile();
  // Configuración WiFi (desde wines.json). Si no existe o show=false, no se muestra el QR del WiFi.
  const wifi = payload.wifi_config || null;
  const showWifi = !!(wifi && wifi.show && wifi.ssid);
  // Generar QRs (solo necesario en TV)
  let qrCataHtml = '';
  let qrWifiHtml = '';
  if (!mobile) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(window.location.origin + '/');
      qr.make();
      qrCataHtml = qr.createSvgTag({ scalable: true, margin: 2 });
    } catch (e) {
      qrCataHtml = '';
    }
    if (showWifi) {
      try {
        // Formato estándar de QR para WiFi: WIFI:T:WPA;S:<ssid>;P:<password>;;
        const ssid = String(wifi.ssid).replace(/([\\;,:"])/g, '\\$1');
        const pass = String(wifi.password || '').replace(/([\\;,:"])/g, '\\$1');
        const auth = wifi.password ? 'WPA' : 'nopass';
        const qrw = qrcode(0, 'M');
        qrw.addData(`WIFI:T:${auth};S:${ssid};P:${pass};;`);
        qrw.make();
        qrWifiHtml = qrw.createSvgTag({ scalable: true, margin: 2 });
      } catch (e) {
        qrWifiHtml = '';
      }
    }
  }

  // Lista de invitados ya registrados
  const usersPublic = payload.users_public || {};
  const userEntries = Object.entries(usersPublic);
  let guestsHtml = '';
  const myUid = myUser ? myUser.user_id : null;
  if (userEntries.length === 0) {
    guestsHtml = `
      <div class="welcome-guests">
        <div class="welcome-guests-title">Invitados a la mesa</div>
        <div class="welcome-guests-empty">Esperando a los primeros invitados…</div>
      </div>`;
  } else {
    const guestPills = userEntries.map(([uid, u]) => {
      const hex = getColorHex(u.color);
      const isMe = (uid === myUid) ? ' is-me' : '';
      const name = escapeHtml(u.name || '—');
      return `
        <div class="welcome-guest${isMe}">
          <span class="welcome-guest-dot" style="background:${hex}"></span>
          <span class="welcome-guest-name">${name}</span>
        </div>`;
    }).join('');
    const countLabel = userEntries.length === 1 ? '1 invitado' : `${userEntries.length} invitados`;
    guestsHtml = `
      <div class="welcome-guests">
        <div class="welcome-guests-title">${countLabel} en la mesa</div>
        <div class="welcome-guests-list">${guestPills}</div>
      </div>`;
  }

  // En móvil mostramos también el estado del invitado (identidad/no)
  let mobileBlockHtml = '';
  if (mobile) {
    if (myUser && myUser.user_id) {
      const hex = getColorHex(myUser.color);
      mobileBlockHtml = `
        <div class="welcome-status">
          <span class="name-dot" style="background:${hex}"></span>
          <strong>${escapeHtml(myUser.name || '—')}</strong>, ya estás registrado.<br>
          Espera a que el anfitrión empiece la cata.
        </div>
        <div class="welcome-actions">
          <button class="welcome-btn welcome-btn-edit" id="welcome-edit-btn">Editar mi perfil</button>
        </div>`;
    } else {
      mobileBlockHtml = `
        <div class="welcome-status">
          Toca el botón para registrarte.<br>
          Cuando empiece la cata, podrás votar.
        </div>
        <div class="welcome-actions">
          <button class="welcome-btn" id="welcome-register-btn">Registrarme</button>
        </div>`;
    }
  }

  // Bloques QR (solo TV): WiFi a la izquierda (si está configurado), Cata a la derecha
  const wifiCredsHtml = (showWifi) ? `
          <div class="welcome-qr-credentials">
            <div class="welcome-qr-cred-row">
              <span class="welcome-qr-cred-label">Red</span>
              <span class="welcome-qr-cred-value">${escapeHtml(wifi.ssid)}</span>
            </div>
            ${wifi.password ? `
            <div class="welcome-qr-cred-row">
              <span class="welcome-qr-cred-label">Pass</span>
              <span class="welcome-qr-cred-value">${escapeHtml(wifi.password)}</span>
            </div>` : ''}
          </div>` : '';
  const qrRowHtml = !mobile && (qrWifiHtml || qrCataHtml) ? `
    <div class="welcome-qr-row">
      ${qrWifiHtml ? `
        <div class="welcome-qr-block">
          <div class="welcome-qr-title">Conéctate al WiFi primero</div>
          <div class="welcome-qr">${qrWifiHtml}</div>
          ${wifiCredsHtml}
        </div>` : ''}
      ${qrCataHtml ? `
        <div class="welcome-qr-block">
          <div class="welcome-qr-title">Entra a la cata</div>
          <div class="welcome-qr">${qrCataHtml}</div>
        </div>` : ''}
    </div>` : '';

  root.innerHTML = `
    <div class="welcome-frame">
      <div class="welcome-eyebrow">Bienvenidos a la cata</div>
      <div class="welcome-title">In Vino Veritas</div>
      <div class="welcome-session">${escapeHtml(payload.session || 'Cata')}</div>
      ${qrRowHtml}
      ${!mobile ? '<div class="welcome-cta">Escanea con tu móvil para unirte</div>' : ''}
      ${mobileBlockHtml}
      ${guestsHtml}
      <div class="welcome-host-info">${payload.total} ${payload.total === 1 ? 'vino' : 'vinos'} en cata</div>
    </div>`;

  // En móvil, si NO hay identidad, abrir el modal directamente (a los 600ms para que se vea la bienvenida primero)
  if (mobile && !myUser) {
    setTimeout(() => {
      if (!myUser) showOnboarding('first');
    }, 600);
    // Botón de registro manual
    const btn = document.getElementById('welcome-register-btn');
    if (btn) btn.onclick = () => showOnboarding('first');
  }
  // Botón de editar perfil (usuario ya registrado en welcome)
  if (mobile && myUser) {
    const editBtn = document.getElementById('welcome-edit-btn');
    if (editBtn) editBtn.onclick = () => showOnboarding('edit');
  }
}

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

function stopSummaryViewTimer() {
  if (summaryViewTimer) {
    clearInterval(summaryViewTimer);
    summaryViewTimer = null;
  }
}

function shouldAutoRotateSummary() {
  // Por defecto automático.
  // Cuando el backend exista, podrá mandar summary_auto=false.
  return !serverState || serverState.summary_auto !== false;
}

function getForcedSummaryView() {
  if (!serverState) return null;

  if (serverState.summary_auto === false) {
    return serverState.summary_view === 'journey' ? 'journey' : 'cards';
  }

  return null;
}

function ensureSummaryViewTimer() {
  if (isMobile()) {
    stopSummaryViewTimer();
    return;
  }

  if (!shouldAutoRotateSummary()) {
    stopSummaryViewTimer();
    return;
  }

  if (summaryViewTimer) return;

  summaryViewTimer = setInterval(() => {
    summaryLocalView = summaryLocalView === 'cards' ? 'journey' : 'cards';
    currentSig = null; // forzar re-render de la vista resumen
    renderCurrent();
  }, SUMMARY_ROTATE_MS);
}

function getCurrentSummaryView() {
  if (isMobile()) return 'cards';

  const forced = getForcedSummaryView();
  if (forced) return forced;

  return summaryLocalView;
}

function renderJourneyMapCard(group) {
  const m = group.map;
  const [w, h] = m.size;
  const label = m.label || group.key;

  const sortedItems = [...group.items].sort((a, b) => a.idx - b.idx);
  const linePoints = sortedItems.map(item => `${item.x},${item.y}`).join(' ');

  const pointsHtml = sortedItems.map(item => `
    <g class="journey-point" transform="translate(${item.x} ${item.y})">
      <circle class="journey-point-halo" r="12"></circle>
      <circle class="journey-point-dot" r="5.5"></circle>
      <text class="journey-point-num" x="0" y="0">${item.idx + 1}</text>
    </g>
  `).join('');

  return `
    <section class="journey-map-card">
      <div class="journey-map-title">${escapeHtml(label)}</div>

      <svg
        class="journey-map-svg"
        viewBox="0 0 ${w} ${h}"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <rect class="sea" x="0" y="0" width="${w}" height="${h}"></rect>
        <path class="country" d="${m.path}"></path>

        ${sortedItems.length > 1 ? `
          <polyline class="journey-line" points="${linePoints}"></polyline>
        ` : ''}

        ${pointsHtml}
      </svg>
    </section>
  `;
}

function renderSummaryJourney(payload) {
  stopHighlightsRotation();

  const wines = payload.all_wines || [];
  const m = MAPS_DATA && MAPS_DATA.journey_europe;

  const serverIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.total;

  const dotsHtml = [];
  for (let i = 0; i < payload.total; i++) {
    const cls = ['dot', 'done'];
    if (isMobile() && i <= serverIdx) cls.push('clickable');
    dotsHtml.push(`<div class="${cls.join(' ')}" data-idx="${i}"></div>`);
  }
  dotsHtml.push('<div class="dot summary active"></div>');

  if (!m) {
    root.innerHTML = `
      <div class="summary-frame journey-frame">
        <div class="corner tl"></div>
        <div class="corner tr"></div>
        <div class="corner bl"></div>
        <div class="corner br"></div>

        <header class="summary-header">
          <div class="session-title">${escapeHtml(payload.session || 'Cata')}</div>
          <div class="summary-title-big">Viaje de la cata</div>
          <div class="counter">${payload.total} vinos</div>
        </header>

        <main class="journey-body">
          <section class="journey-maps-grid journey-map-single">
            <div class="journey-empty">
              Falta el mapa journey_europe en maps_data.json.
            </div>
          </section>
        </main>

        <footer class="tv-footer">
          ${dotsHtml.join('')}
        </footer>
      </div>
    `;
    return;
  }

  const [lonMin, lonMax, latMin, latMax] = m.bbox;
  const [mapW, mapH] = m.size;

  const points = wines
    .map((wine, idx) => {
      if (!wine || !Array.isArray(wine.coords) || wine.coords.length !== 2) {
        return null;
      }

      const [lat, lon] = wine.coords;

      const x = (lon - lonMin) / (lonMax - lonMin) * mapW;
      const y = (latMax - lat) / (latMax - latMin) * mapH;

      // Evitar pintar puntos fuera del mapa si alguna coordenada se sale del bbox.
      if (x < 0 || x > mapW || y < 0 || y > mapH) {
        return null;
      }

      return {
        idx,
        wine,
        x,
        y,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx);

  // Secuencia de animación:
  // punto 1 → tramo 1-2 → punto 2 → tramo 2-3 → punto 3...
  const JOURNEY_POINT_DELAY = 0.3;
  const JOURNEY_SEGMENT_DELAY = 0.9;
  const JOURNEY_STEP = 2;

  const pointDelayByWineIdx = new Map();
  points.forEach((p, pointOrderIdx) => {
    const delay = pointOrderIdx === 0
      ? JOURNEY_POINT_DELAY
      : JOURNEY_SEGMENT_DELAY + (pointOrderIdx - 1) * JOURNEY_STEP + 1.45;

    pointDelayByWineIdx.set(p.idx, delay);
  });

  const segmentsHtml = points.slice(1).map((p, i) => {
    const prev = points[i];
    const delay = JOURNEY_SEGMENT_DELAY + i * JOURNEY_STEP;

    return `
      <line
        class="journey-segment animated"
        x1="${prev.x}"
        y1="${prev.y}"
        x2="${p.x}"
        y2="${p.y}"
        pathLength="1"
        style="--delay: ${delay}s"
      ></line>
    `;
  }).join('');

  const pointsHtml = points.map((p) => {
    const delay = pointDelayByWineIdx.get(p.idx) ?? JOURNEY_POINT_DELAY;

    return `
      <g class="journey-point" transform="translate(${p.x} ${p.y})">
        <g class="journey-point-inner animated" style="--delay: ${delay}s">
          <circle class="journey-point-halo" r="13"></circle>
          <circle class="journey-point-dot" r="5.8"></circle>
          <text class="journey-point-num" x="0" y="0">${p.idx + 1}</text>
        </g>
      </g>
    `;
  }).join('');

  const itineraryHtml = wines.map((wine, idx) => {
    const place = wine.region || wine.do || '—';
    const delay = pointDelayByWineIdx.get(idx) ?? 0.2;

    return `
      <div class="journey-itinerary-item animated" style="--delay: ${delay}s">
        <span class="journey-itinerary-num">${idx + 1}</span>
        <span class="journey-itinerary-name">${escapeHtml(wine.name || '—')}</span>
        <span class="journey-itinerary-place">${escapeHtml(place)}</span>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="summary-frame journey-frame">
      <div class="corner tl"></div>
      <div class="corner tr"></div>
      <div class="corner bl"></div>
      <div class="corner br"></div>

      <header class="summary-header">
        <div class="session-title">${escapeHtml(payload.session || 'Cata')}</div>
        <div class="summary-title-big">Viaje de la cata</div>
        <div class="counter">${payload.total} vinos</div>
      </header>

      <main class="journey-body">
        <section class="journey-maps-grid journey-map-single">
          <section class="journey-map-card journey-map-main">
            <div class="journey-map-title">${escapeHtml(m.label || 'Europa occidental')}</div>

            <svg
              class="journey-map-svg"
              viewBox="0 0 ${mapW} ${mapH}"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <rect class="sea" x="0" y="0" width="${mapW}" height="${mapH}"></rect>
              <path class="country" d="${m.path}"></path>

              ${segmentsHtml}
              ${pointsHtml}
            </svg>
          </section>
        </section>

        <aside class="journey-itinerary">
          <div class="journey-itinerary-title">Orden de cata</div>
          ${itineraryHtml}
        </aside>
      </main>

      <footer class="tv-footer">
        ${dotsHtml.join('')}
      </footer>
    </div>
  `;

  root.querySelectorAll('.tv-footer .dot.clickable').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    if (!isNaN(idx)) el.onclick = () => navigateTo(idx);
  });
}

function renderSummary(payload) {
  const layout = getSummaryLayout(payload.total);
  const wines = payload.all_wines || [];
  const votesSummary = payload.votes_summary || {};
  const highlights = payload.highlights || [];
  const personalFavorites = payload.personal_favorites || {};
  const usersPublic = payload.users_public || {};

  // Detectar el(los) índice(s) favorito(s) para resaltar la tarjeta
  const favoriteIndices = new Set(
    highlights.filter(h => h.type === 'favorite').map(h => h.wine_idx)
  );

  // Detectar favoritos personales (solo móvil, solo si hay identidad)
  // El favorito personal es el/los vino(s) con la puntuación más alta del usuario
  const myFavoriteIndices = new Set();
  let myColorHex = null;
  if (isMobile() && myUser && myUser._votes) {
    let maxScore = 0;
    for (const [idxStr, vote] of Object.entries(myUser._votes)) {
      const s = vote && vote.score;
      if (s && s > maxScore) maxScore = s;
    }
    // Mínimo 4★ — no resaltamos si todo es mediocre
    if (maxScore >= 4) {
      for (const [idxStr, vote] of Object.entries(myUser._votes)) {
        if (vote && vote.score === maxScore) {
          myFavoriteIndices.add(parseInt(idxStr, 10));
        }
      }
      myColorHex = getColorHex(myUser.color);
    }
  }

  let cardIdx = 0;
  const rowsHtml = layout.map(rowCount => {
    const cardsHtml = [];
    for (let i = 0; i < rowCount && cardIdx < wines.length; i++) {
      const thisIdx = cardIdx;
      const w = wines[cardIdx++];
      const photoHtml = w.photo
        ? `<img src="/static/photos/${encodeURIComponent(w.photo)}" alt="" onerror="this.replaceWith(document.getElementById('bottle-fallback').cloneNode(true)); this.parentElement.querySelector('svg').style.display='';">`
        : (document.getElementById('bottle-fallback').outerHTML.replace('display:none', '').replace('id="bottle-fallback"', 'class="placeholder-svg"'));

      const grapeText = w.grape || '';
      const doText = w.do || '';

      let ratingHtml = '';
      if (w.rating && String(w.rating).trim()) {
        const m = String(w.rating).match(/^(\S+)\s+(.+)$/);
        if (m) {
          ratingHtml = `<div class="summary-card-rating">
            <span class="summary-card-rating-sys">${escapeHtml(m[1])}</span>
            <span class="summary-card-rating-sco">${escapeHtml(m[2])}</span>
          </div>`;
        } else {
          ratingHtml = `<div class="summary-card-rating">
            <span class="summary-card-rating-sco">${escapeHtml(w.rating)}</span>
          </div>`;
        }
      }

      const vintageInline = w.vintage ? `<span class="summary-card-vintage">${escapeHtml(String(w.vintage))}</span>` : '';
      const grapeHtml = grapeText ? `<div class="summary-card-grape">${escapeHtml(grapeText)}</div>` : '';
      const doHtml = doText ? `<div class="summary-card-do">${escapeHtml(doText)}</div>` : '';

      // Agregado mini de votos
      const agg = votesSummary[String(thisIdx)];
      let aggHtml = '';
      if (agg && agg.count > 0) {
        const filled = Math.round(agg.avg);
        let starStr = '';
        for (let s = 0; s < 5; s++) starStr += (s < filled ? '★' : '☆');
        const plural = agg.count === 1 ? 'voto' : 'votos';
        aggHtml = `<div class="summary-card-agg">
          <span class="summary-card-agg-stars">${starStr}</span>
          <span class="summary-card-agg-value">${agg.avg.toFixed(1)}</span>
          <span class="summary-card-agg-count">· ${agg.count} ${plural}</span>
        </div>`;
      }

      // Fans: usuarios que tienen este vino como su favorito personal
      const fans = personalFavorites[String(thisIdx)] || [];
      let fansHtml = '';
      if (fans.length > 0) {
        let pillsHtml;
        if (fans.length <= 2) {
          // Pocos: mostrar dot + nombre
          pillsHtml = fans.map(uid => {
            const u = usersPublic[uid] || {};
            const hex = getColorHex(u.color);
            const name = escapeHtml(u.name || '—');
            return `<span class="summary-card-fan"><span class="summary-card-fan-dot" style="background:${hex}"></span>${name}</span>`;
          }).join('');
        } else {
          // Muchos: solo dots agrupados + contador entre paréntesis
          const dots = fans.map(uid => {
            const u = usersPublic[uid] || {};
            const hex = getColorHex(u.color);
            const name = escapeHtml(u.name || '—');
            return `<span class="summary-card-fan-dot" style="background:${hex}" title="${name}"></span>`;
          }).join('');
          pillsHtml = `<span class="summary-card-fans-cluster">${dots}</span><span class="summary-card-fans-count">(${fans.length})</span>`;
        }
        fansHtml = `<div class="summary-card-fans"><span class="summary-card-fans-label">Favorito de:</span>${pillsHtml}</div>`;
      }

      const isFavorite = favoriteIndices.has(thisIdx);
      const isMyFavorite = myFavoriteIndices.has(thisIdx);
      const classes = ['summary-card'];
      if (isFavorite) classes.push('is-favorite');
      if (isMyFavorite) classes.push('is-my-favorite');

      const badgeHtml = isFavorite ? '<div class="summary-card-badge">★ Favorito de la mesa</div>' : '';
      const myBadgeHtml = isMyFavorite && myColorHex
        ? `<div class="summary-card-mybadge" style="background:${myColorHex}">★ Mi favorito</div>`
        : '';

      // Cards clickables en móvil: tocar el card lleva a la vista de ese vino
      const mobileNav = isMobile();
      const clickableClass = mobileNav ? ' clickable' : '';
      const clickAttr = mobileNav ? ` data-nav-idx="${thisIdx}"` : '';
      // Estilo inline para el borde lateral coloreado si es favorito personal
      const styleAttr = isMyFavorite && myColorHex
        ? ` style="border-left-color: ${myColorHex}"`
        : '';

      cardsHtml.push(`
        <div class="${classes.join(' ')}${clickableClass}"${clickAttr}${styleAttr}>
          <div class="summary-card-photo">${photoHtml}</div>
          <div class="summary-card-info">
            ${badgeHtml}
            ${myBadgeHtml}
            <div class="summary-card-name-row">
              <span class="summary-card-name">${escapeHtml(w.name || '—')}</span>
              ${vintageInline}
            </div>
            <div class="summary-card-winery">${escapeHtml(w.winery || '—')}</div>
            ${grapeHtml}
            ${doHtml}
            ${ratingHtml}
            ${aggHtml}
            ${fansHtml}
          </div>
        </div>
      `);
    }
    return `<div class="summary-row">${cardsHtml.join('')}</div>`;
  }).join('');

  // Dots: todos hechos + uno especial del resumen activo
  const serverIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.total;
  const mobile = isMobile();
  const dotsHtml = [];
  for (let i = 0; i < payload.total; i++) {
    const cls = ['dot', 'done'];
    if (mobile && i <= serverIdx) cls.push('clickable');
    dotsHtml.push(`<div class="${cls.join(' ')}" data-idx="${i}"></div>`);
  }
  dotsHtml.push('<div class="dot summary"></div>');

  root.innerHTML = `
    <div class="summary-frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
      <div class="summary-header">
        <div class="session-title">${escapeHtml(payload.session || 'Cata')}</div>
        <div class="summary-title-big">Resumen</div>
        <div class="counter">${payload.total} vinos</div>
      </div>
      <div id="highlights-overlay" class="highlights-overlay empty"></div>
      <div class="summary-rows">${rowsHtml}</div>
      <div class="tv-footer">${dotsHtml.join('')}</div>
    </div>`;

  // Conectar dots clicables (solo móvil)
  root.querySelectorAll('.tv-footer .dot.clickable').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    if (!isNaN(idx)) el.onclick = () => navigateTo(idx);
  });

  // Conectar cards clickables (solo móvil: tap lleva al vino)
  root.querySelectorAll('.summary-card.clickable').forEach(el => {
    const idx = parseInt(el.dataset.navIdx, 10);
    if (!isNaN(idx)) el.onclick = () => navigateTo(idx);
  });

  // Iniciar rotación de destacados
  startHighlightsRotation(highlights);
}

// ── Rotación de destacados ──
let highlightsRotationTimer = null;
let highlightsCurrentIdx = 0;

function stopHighlightsRotation() {
  if (highlightsRotationTimer) {
    clearTimeout(highlightsRotationTimer);
    highlightsRotationTimer = null;
  }
}

function startHighlightsRotation(highlights) {
  stopHighlightsRotation();
  const el = document.getElementById('highlights-overlay');
  if (!el) return;
  if (!highlights || highlights.length === 0) {
    el.classList.add('empty');
    return;
  }
  el.classList.remove('empty');
  highlightsCurrentIdx = 0;
  renderHighlight(el, highlights, 0);
  if (highlights.length > 1) {
    scheduleNextHighlight(el, highlights);
  }
}

function scheduleNextHighlight(el, highlights) {
  highlightsRotationTimer = setTimeout(() => {
    // Fade out
    el.classList.add('fading');
    setTimeout(() => {
      highlightsCurrentIdx = (highlightsCurrentIdx + 1) % highlights.length;
      renderHighlight(el, highlights, highlightsCurrentIdx);
      el.classList.remove('fading');
      scheduleNextHighlight(el, highlights);
    }, 400);
  }, 6000);
}

function getColorHexFromKey(key) {
  // Buscar en la cache de colores cargada por fetchColors
  if (typeof onboardingColors !== 'undefined' && onboardingColors.length) {
    const found = onboardingColors.find(c => c.key === key);
    if (found) return found.hex;
  }
  return '#d8c094';
}

function renderHighlight(el, highlights, idx) {
  const h = highlights[idx];
  if (!h) { el.innerHTML = ''; return; }

  // Indicadores de rotación (solo si hay >1 destacado)
  const dotsHtml = highlights.length > 1
    ? highlights.map((_, i) =>
        `<div class="highlights-dot${i === idx ? ' active' : ''}"></div>`
      ).join('')
    : '';

  let iconChar = '✦';
  let bodyHtml = '';

  if (h.type === 'favorite') {
    iconChar = '🏆';
    const filled = Math.round(h.avg || 0);
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += (i < filled ? '★' : '☆');
    const plural = h.count === 1 ? 'voto' : 'votos';
    bodyHtml = `
      <div class="highlights-title">${escapeHtml(h.wine_name || '')}</div>
      <div class="highlights-meta">
        <span class="highlights-stars">${starStr}</span>
        <span class="highlights-avg">${(h.avg || 0).toFixed(1)}</span>
        <span class="highlights-extra">· ${h.count} ${plural} · ${escapeHtml(h.winery || '')}</span>
      </div>`;
  } else if (h.type === 'polarizing') {
    iconChar = '⚡';
    bodyHtml = `
      <div class="highlights-title">${escapeHtml(h.wine_name || '')}</div>
      <div class="highlights-meta">
        <span class="highlights-extra">De ${h.min_score}★ a ${h.max_score}★ · sin consenso</span>
      </div>`;
  } else if (h.type === 'unanimous') {
    iconChar = '🤝';
    const filled = Math.round(h.avg || 0);
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += (i < filled ? '★' : '☆');
    bodyHtml = `
      <div class="highlights-title">${escapeHtml(h.wine_name || '')}</div>
      <div class="highlights-meta">
        <span class="highlights-stars">${starStr}</span>
        <span class="highlights-avg">${(h.avg || 0).toFixed(1)}</span>
        <span class="highlights-extra">· todos de acuerdo</span>
      </div>`;
  } else if (h.type === 'comment') {
    iconChar = '💬';
    const colorHex = getColorHexFromKey(h.user_color);
    bodyHtml = `
      <div class="highlights-quote">${escapeHtml(h.comment || '')}</div>
      <div class="highlights-attrib">
        <span class="highlights-attrib-dot" style="background:${colorHex}"></span>
        <span><strong>${escapeHtml(h.user_name || '—')}</strong> sobre ${escapeHtml(h.wine_name || '')}</span>
      </div>`;
  }

  el.innerHTML = `
    <div class="highlights-dots">${dotsHtml}</div>
    <div class="highlights-eyebrow">
      <span class="highlights-icon">${iconChar}</span>
      <span>${escapeHtml(h.label || '')}</span>
    </div>
    ${bodyHtml}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Navegación local (móvil): el invitado puede retroceder pero no adelantarse al anfitrión ──
let serverState = null;
let localIndex = null;
let initialized = false;
const isMobile = () => window.innerWidth <= 900;

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
    // El anfitrión cambió de vino → no enviamos comentarios automáticamente.
    // Si el usuario estaba escribiendo, el borrador queda guardado localmente.
    localIndex = serverIdx;
  } else if (isMobile() && localIndex > serverIdx) {
    // Por si acaso: no permitir quedar adelantado
    localIndex = serverIdx;
  }
  // Si el server NO cambió, respetar la navegación manual local (móvil)

  renderCurrent();

  // Popups de votos en TV (solo en vista de vino)
  if (!isMobile() && !payload.is_summary && !payload.is_welcome && payload.current_wine_votes) {
    detectVoteChanges(payload.index, payload.current_wine_votes, payload.users_public || {});
  } else {
    // Reset el cache si no estamos en vista de vino
    lastVotesByUser = {};
    lastVotesForWineIdx = null;
  }
}

// ─── Sistema de popups de votos (solo TV) ─────────────────────────────
let lastVotesByUser = {};
let lastVotesForWineIdx = null;
const POPUP_DURATION_MS = 5000;
const POPUP_FADEOUT_MS = 400;
const MAX_POPUPS = 5;

function detectVoteChanges(wineIdx, currentVotes, usersPublic) {
  // Si cambió el vino, no mostrar popups: solo cachear el estado actual
  if (lastVotesForWineIdx !== wineIdx) {
    lastVotesByUser = JSON.parse(JSON.stringify(currentVotes));
    lastVotesForWineIdx = wineIdx;
    return;
  }

  // Detectar cambios usuario por usuario
  for (const [uid, vote] of Object.entries(currentVotes)) {
    const prev = lastVotesByUser[uid] || {};
    const user = usersPublic[uid] || {};
    if (!user.name) continue;

    // Score: nuevo o cambiado
    const prevScore = prev.score;
    const newScore = vote.score;
    if (newScore && newScore !== prevScore) {
      showVotePopup(user, newScore, prevScore != null);
    } else if (!newScore && prevScore) {
      showRetractPopup(user);
    }

    // Comentario: nuevo o cambiado (ignorar vacíos)
    const prevComment = (prev.comment || '').trim();
    const newComment = (vote.comment || '').trim();
    if (newComment && newComment !== prevComment) {
      showCommentPopup(user, newComment);
    }
  }

  lastVotesByUser = JSON.parse(JSON.stringify(currentVotes));
}

function showVotePopup(user, score, isUpdate) {
  // Texto contextual según puntuación
  const actions = {
    5: isUpdate ? 'ahora dice ¡cinco estrellas!' : 'se ha enamorado',
    4: isUpdate ? 'lo ha subido a' : 'le ha gustado',
    3: isUpdate ? 'ahora le da' : 'lo ha votado',
    2: isUpdate ? 'lo ha bajado a' : 'no le ha convencido',
    1: isUpdate ? 'ha rebajado a' : 'lo ha sufrido',
  };
  const stars = '★'.repeat(score) + '☆'.repeat(5 - score);
  appendPopup({
    user: user,
    action: actions[score] || 'ha votado',
    extra: `<span class="vote-popup-stars">${stars}</span>`,
    typeClass: `score-${score}`,
  });
}

function showRetractPopup(user) {
  appendPopup({
    user: user,
    action: 'ha retirado su voto',
    extra: '',
    typeClass: 'comment',
  });
}

function showCommentPopup(user, comment) {
  const truncated = comment.length > 80 ? comment.slice(0, 80) + '…' : comment;
  appendPopup({
    user: user,
    action: 'ha comentado',
    extra: `<div class="vote-popup-comment">«${escapeHtml(truncated)}»</div>`,
    typeClass: 'comment',
    extended: true,
  });
}

function appendPopup({ user, action, extra, typeClass, extended }) {
  let container = document.getElementById('vote-popup-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'vote-popup-container';
    document.body.appendChild(container);
  }
  // Limitar número de popups simultáneos: eliminar el más antiguo
  while (container.children.length >= MAX_POPUPS) {
    container.firstChild.remove();
  }

  const hex = getColorHex(user.color);
  const popup = document.createElement('div');
  popup.className = `vote-popup ${typeClass}`;
  popup.innerHTML = `
    <span class="vote-popup-dot" style="background:${hex}"></span>
    <div class="vote-popup-body">
      <span class="vote-popup-name">${escapeHtml(user.name)}</span>
      <span class="vote-popup-action">${action}</span>
    </div>
    ${extra}
  `;
  container.appendChild(popup);

  // Animar entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => popup.classList.add('show'));
  });

  // Salida automática
  setTimeout(() => {
    popup.classList.remove('show');
    popup.classList.add('hide');
    setTimeout(() => popup.remove(), POPUP_FADEOUT_MS);
  }, POPUP_DURATION_MS);
}
// ───────────────────────────────────────────────────────────────────────

function navigateTo(idx) {
  if (!serverState) return;
  const serverIdx = serverState.is_summary ? serverState.total : serverState.index;
  if (idx < 0 || idx > serverIdx) return;  // no se puede ir adelante del server
  if (idx === localIndex) return;
  // No enviamos comentarios automáticamente al navegar: solo se guardan como borrador local.
  localIndex = idx;
  currentSig = null;  // forzar rerender (sin animación)
  renderCurrent();
}
window.navigateTo = navigateTo;

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
      JSON.stringify(serverState.personal_favorites || {});

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
    };

    if (summaryView === 'journey') {
      renderSummaryJourney(summaryPayload);
    } else {
      renderSummary(summaryPayload);
    }

    return;

    stopSummaryViewTimer();

    // Vista vino individual — paramos la rotación de destacados si la había
    stopHighlightsRotation();

  }

  // Vista vino individual — paramos la rotación de destacados si la había
  stopHighlightsRotation();
  const wine = serverState.all_wines[localIndex];
  if (!wine) return;

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
    star.classList.toggle('filled', myVoteScore !== null && i < myVoteScore);
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
      const filled = Math.round(agg.avg);
      let starStr = '';
      for (let i = 0; i < 5; i++) starStr += (i < filled ? '★' : '☆');
      const plural = agg.count === 1 ? 'voto' : 'votos';
      valEl.innerHTML =
        '<span class="vote-agg-stars">' + starStr + '</span>' +
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
      const filled = Math.round(agg.avg);
      let starStr = '';
      for (let i = 0; i < 5; i++) starStr += (i < filled ? '★' : '☆');
      const plural = agg.count === 1 ? 'voto' : 'votos';
      pillStarsEl.textContent = starStr;
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
  if (commentEl) commentEl.value = '';

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
  if (commentEl) commentEl.value = textToShow;
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

  try {
    const r = await fetch('/api/vote/' + wineIdx, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!r.ok) return false;

    // Actualizar cache local de mi voto
    myUser._votes = myUser._votes || {};
    const key = String(wineIdx);
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

// Click en estrella
document.body.addEventListener('click', (e) => {
  const star = e.target.closest('.vote-star');
  if (!star) return;
  if (window.innerWidth > 1100) return;  // solo móvil
  const newScore = parseInt(star.dataset.score, 10);
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
    btnEl.classList.add('saved');
    btnEl.textContent = '✓ Guardado';
    btnEl.disabled = true;
  } else {
    btnEl.classList.remove('saved');
    btnEl.textContent = myUser ? 'Enviar' : 'Identifícate y envía';
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

// QR con la URL actual (root del sitio)
try {
  const qr = qrcode(0, 'M');
  qr.addData(window.location.origin + '/');
  qr.make();
  document.getElementById('qr-img').innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
} catch (err) {
  console.warn('QR fallo:', err);
  document.getElementById('qr-widget').style.display = 'none';
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
  if (window.innerWidth > 900) return;
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