// ════════════════════════════════════════════════════════════════════════
// MAPAS — datos regionales, SVG (TV) y Leaflet (móvil)
// Carga: 2º (tras app-core). Comparte scope global con el resto de app-*.js
// ════════════════════════════════════════════════════════════════════════

// Instancia Leaflet (mapa móvil). Leaflet no permite re-inicializar el mismo div,
// así que reutilizamos la instancia y solo recolocamos la vista/marcador.
let leafletMap = null;
let leafletMarker = null;

// 4 mapas regionales (Iberia, Francia, Italia, Alemania)
// Ahora se cargan desde /static/maps/maps_data.json para no meter el JSON gigante en el HTML.
let MAPS_DATA = null;
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
    let host = cont.querySelector('#map-leaflet');

    if (!host) {
      cont.innerHTML = '<div id="map-leaflet"></div>';
      host = cont.querySelector('#map-leaflet');
      leafletMap = null;
      leafletMarker = null;
    }

    if (!host) {
      return null;
    }

    // Fallback defensivo por si el CSS no ha aplicado todavía.
    host.style.width = '100%';
    host.style.height = '100%';

    const pinIcon = L.divIcon({
      className: '',
      html: '<div class="map-pin-pulse"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const mobileZoomByMap = {
      canaries: 7,
      iberia: 6,
      france: 6,
      germany: 6,
      italy: 6,
    };

    const key = pickMap(lat, lon);
    const zoom = mobileZoomByMap[key] || 5;

    if (!leafletMap) {
      leafletMap = L.map(host, {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: true,
      });

      // Zoom en la esquina superior derecha: la izquierda la ocupa la etiqueta de la D.O.
      L.control.zoom({ position: 'topright' }).addTo(leafletMap);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(leafletMap);

      leafletMarker = L.marker([lat, lon], { icon: pinIcon }).addTo(leafletMap);
    } else {
      if (leafletMarker) {
        leafletMarker.setLatLng([lat, lon]);
      } else {
        leafletMarker = L.marker([lat, lon], { icon: pinIcon }).addTo(leafletMap);
      }
    }

    leafletMap.setView([lat, lon], zoom, { animate: true });

    // Leaflet en móvil a veces necesita varios invalidateSize
    // porque el contenedor acaba de entrar en layout.
    requestAnimationFrame(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
        leafletMap.setView([lat, lon], zoom, { animate: false });
      }
    });

    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 150);

    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 400);

    return 'leaflet';
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

// ── Mapamundi del modo duelo (solo TV) ──────────────────────────────────────
// Devuelve el markup SVG de un mapamundi (equirectangular) con dos pines —el
// origen del Viejo Mundo y el del Nuevo— unidos por un arco. Proyección lineal
// idéntica a renderMap. Se inyecta en la vista duelo (app-duel-view.js).
function buildWorldMapSVG(coordsViejo, coordsNuevo) {
  if (!MAPS_DATA || !MAPS_DATA.world) return '';
  const m = MAPS_DATA.world;
  const [lonMin, lonMax, latMin, latMax] = m.bbox;
  const [W, H] = m.size;
  const ASPECT = W / H;   // 2:1, igual que el marco .duel-map
  const project = (lat, lon) => [
    (lon - lonMin) / (lonMax - lonMin) * W,
    (latMax - lat) / (latMax - latMin) * H,
  ];

  const hasV = Array.isArray(coordsViejo) && coordsViejo.length === 2;
  const hasN = Array.isArray(coordsNuevo) && coordsNuevo.length === 2;
  const pv = hasV ? project(coordsViejo[0], coordsViejo[1]) : null;
  const pn = hasN ? project(coordsNuevo[0], coordsNuevo[1]) : null;

  // ── viewBox: por defecto el mundo entero; con dos puntos, hacemos "zoom"
  // recortando a la caja que los contiene (con margen) y respetando el aspecto
  // 2:1 del marco para no reintroducir huecos a los lados. ──
  let vx = 0, vy = 0, vw = W, vh = H;
  if (pv && pn) {
    let minX = Math.min(pv[0], pn[0]), maxX = Math.max(pv[0], pn[0]);
    let minY = Math.min(pv[1], pn[1]), maxY = Math.max(pv[1], pn[1]);
    const spanX = maxX - minX, spanY = maxY - minY;
    const span = Math.max(spanX, spanY);
    const pad = span * 0.18 + 25;
    const topExtra = spanX * 0.28 + 30;   // hueco arriba para el arco
    minX -= pad; maxX += pad;
    minY -= pad + topExtra;
    maxY += pad;
    let w = maxX - minX, h = maxY - minY;
    // Ajustar al aspecto 2:1 expandiendo la dimensión que falte.
    if (w / h < ASPECT) { const nw = h * ASPECT; minX -= (nw - w) / 2; w = nw; }
    else { const nh = w / ASPECT; minY -= (nh - h) / 2; h = nh; }
    // Mínimo para no sobre-ampliar en parejas muy próximas.
    const MINW = 430;
    if (w < MINW) { const nh = MINW / ASPECT; minX -= (MINW - w) / 2; minY -= (nh - h) / 2; w = MINW; h = nh; }
    // Recortar al mundo conservando el tamaño de la caja.
    if (w > W) w = W;
    if (h > H) h = H;
    if (minX < 0) minX = 0;
    if (minY < 0) minY = 0;
    if (minX + w > W) minX = W - w;
    if (minY + h > H) minY = H - h;
    vx = minX; vy = minY; vw = w; vh = h;
  }

  // Escala relativa al mundo completo: pines y trazos se dimensionan con ella
  // para que el tamaño APARENTE sea parecido en cualquier nivel de zoom.
  const s = vw / W;
  const r = (base) => (base * s).toFixed(1);

  const pin = (x, y, cls) => `
    <g class="wpin ${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle class="wpin-glow" r="${r(30)}"></circle>
      <circle class="wpin-pulse" r="${r(13)}"></circle>
      <circle class="wpin-dot" r="${r(8)}" style="stroke-width:${r(2)}"></circle>
    </g>`;

  let arc = '';
  if (pv && pn) {
    const cx = (pv[0] + pn[0]) / 2;
    const cy = Math.min(pv[1], pn[1]) - Math.abs(pn[0] - pv[0]) * 0.28 - 50 * s;
    arc = `<path class="wpin-arc" d="M${pv[0].toFixed(1)},${pv[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${pn[0].toFixed(1)},${pn[1].toFixed(1)}" style="stroke-width:${r(3)};stroke-dasharray:${r(10)} ${r(8)}"></path>`;
  }
  let pins = '';
  if (pv) pins += pin(pv[0], pv[1], 'wpin-viejo');
  if (pn) pins += pin(pn[0], pn[1], 'wpin-nuevo');

  return `
    <svg class="world-map-svg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect class="world-sea" x="0" y="0" width="${W}" height="${H}"></rect>
      <path class="world-land" d="${m.path}" style="stroke-width:${r(1)}"></path>
      ${arc}
      ${pins}
    </svg>`;
}
