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
