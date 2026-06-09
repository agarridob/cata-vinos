# 🍷 Cata de Vinos — In Vino Veritas

Webapp en **Flask** para organizar una cata de vinos con pantalla principal tipo TV, panel de control para el anfitrión, edición visual de la carta, gestión de invitados, votación en tiempo real y visualización geográfica de los vinos.

La app está pensada para una dinámica de cata compartida:

- La pantalla grande muestra bienvenida, vino actual, ficha, foto, mapa de origen, votos agregados y resumen final.
- El anfitrión controla la cata desde `/control`.
- El panel está protegido con autenticación.
- El panel está organizado en pestañas: **Cata**, **Invitados**, **Carta** y **Admin**.
- Los invitados entran desde el móvil escaneando un QR.
- Cada invitado puede identificarse con nombre y color, votar vinos y dejar comentarios.
- La pantalla se actualiza en directo mediante **Server-Sent Events**.
- La carta de vinos puede editarse visualmente desde el panel de control.
- Las catas pasadas pueden consultarse desde `/historico` (protegido con login): por cata, por vino o con estadísticas globales.
- La configuración WiFi puede gestionarse desde la pestaña **Admin**.
- La pantalla TV usa mapas SVG regionales, zoom dinámico y una vista animada del viaje de la cata.
- La versión móvil usa Leaflet con OpenStreetMap y fallback CSS robusto para asegurar el render del mapa.

---

## 🚀 Desarrollo rápido

```bash
make
```

O explícitamente:

```bash
make dev
```

---

## ✨ Funcionalidades principales

### Pantalla TV (`/`)

Muestra:

- Pantalla de bienvenida con QR para invitados.
- QR WiFi opcional.
- Nombre de la sesión.
- Información completa del vino.
- Foto de botella.
- Mapa SVG regional en pantallas grandes.
- Mapa Leaflet en móviles.
- Progreso de la cata.
- Votaciones agregadas en tiempo real.
- Popups de votos y comentarios en TV.
- Resumen final con tarjetas de vinos.
- Vista alternativa **Viaje de la cata**.
- Animación progresiva del recorrido del viaje.

---

## 🎛️ Panel de control (`/control`)

Organizado en pestañas:

```text
Cata | Invitados | Carta | Admin
```

---

### 🍷 Cata

Uso principal durante la sesión:

- Avanzar / retroceder vinos.
- Ir a un vino concreto.
- Ir al resumen.
- Volver a bienvenida sin perder invitados ni votos.
- Recargar `wines.json`.
- Controlar la presentación del resumen:
  - automático;
  - fijar resumen original;
  - fijar viaje visual de la cata.

La rotación entre resumen original y viaje visual está controlada en `static/js/app/app-summary.js`:

```js
const SUMMARY_ROTATE_MS = 30000;
```

Actualmente se deja en **30 segundos** para que la animación del viaje tenga tiempo de completarse y el mapa final quede unos segundos visible.

---

### 👥 Invitados

- Ver invitados registrados en tiempo real.
- Ver color y nombre de cada invitado.
- Expulsar invitado.
- Al expulsar un invitado, se borran también sus votos asociados.
- El móvil del invitado expulsado detecta el cambio y fuerza nuevo registro.

---

### 📖 Carta

Editor visual de vinos:

- Cargar carta desde `data/wines.json`.
- Editar campos.
- Añadir vinos.
- Duplicar vinos.
- Eliminar vinos.
- Reordenar vinos.
- Guardar cambios en `wines.json`.
- Refrescar la TV tras guardar.

Campos editables:

- Nombre.
- Bodega.
- Añada.
- D.O.
- Uva.
- Región.
- Rating.
- Curiosidad.
- Foto.
- Coordenadas.

---

### ⚙️ Admin

Configuración avanzada:

- Configuración WiFi para bienvenida.
- Limpiar votos manteniendo invitados.
- Archivar sesión.
- Reset completo de pruebas.

Ejemplo de configuración WiFi en `wines.json`:

```json
"wifi": {
  "show": true,
  "ssid": "MiWifi",
  "password": "clave123"
}
```

---

## 📚 Históricos de catas (`/historico`)

Vista de solo lectura, protegida con el mismo login que `/control`, sobre las
sesiones archivadas en `data/archive/`. Se accede desde el botón **🍷 Históricos**
del header del panel de control.

Una pantalla inicial permite elegir el tipo de análisis:

### Por cata

Revive una cata completa. Para cada vino muestra foto, datos, **nota media**,
**ranking** dentro de esa cata y el desglose por catador (su puntuación y su
comentario), con el color de copa de cada invitado.

### Por vino

**Catálogo histórico** de todos los vinos catados alguna vez, ordenado por nota
media. La identidad de un vino es **bodega + nombre + añada**: la misma botella
catada en varias sesiones se agrupa en una sola ficha.

- **Filtros** por bodega, uva y D.O. + buscador de texto. El campo de uva
  admite coupages (`Viura, Garnacha Blanca, …`) y filtra por cualquiera de ellas.
- Al abrir un vino: su **media histórica**, el **desglose por cata** (ves si subió
  o bajó entre sesiones) y **todos los comentarios** agregados de todas las catas.
- **Gráficas** (SVG/CSS, sin librerías): un **histograma de puntuaciones**
  (cuántos 1★…5★ recibió, para ver consenso o polarización) y, si el vino se ha
  catado en ≥2 sesiones, una **línea de evolución** de su nota media.

> La agrupación por vino es sensible a cómo se escriben los datos: si la añada o el
> nombre se introducen distinto en dos catas (`2024` vs `'24`), se tratarán como
> vinos diferentes.

### Estadísticas

Palmarés agregado de **todas** las catas (se calcula en el cliente sobre
`/api/historico-wines`, sin endpoint extra):

- **🎖️ Premios**: tarjetas con el favorito de la casa, el más divisivo (mayor
  dispersión de notas), el chollo (mejor relación nota/precio) y la uva estrella.
- **🏆 Podio de vinos**: rankings de mejor valorados, más divisivos, mejor
  calidad-precio y los olvidables. Los rankings de vino exigen un mínimo de votos
  (`MIN_VOTES`, relajado automáticamente si hay pocos datos).
- **🍇 Por categoría**: mejores bodegas, uvas y D.O. (media ponderada por votos).
- **🔢 Números de la casa**: totales (catas, vinos, votos, comentarios), el vino
  más repetido y un histograma global de todas las puntuaciones.

> No hay estadísticas **por catador** (más activo, más exigente…) porque la
> identidad de un invitado solo es su nombre, sin identificador estable. Queda
> pendiente para cuando se pida email en el registro.

---

## 🗺️ Mapas

La app usa dos estrategias diferentes según dispositivo:

```text
TV / escritorio → SVG local
Móvil           → Leaflet + OpenStreetMap
```

Esta separación evita problemas de rendimiento/render en TV y mantiene una buena experiencia móvil.

---

## 🖥️ Mapas en TV / escritorio

En pantallas grandes se usan **mapas SVG locales** cargados desde:

```text
static/maps/maps_data.json
```

Características:

- SVG regionales precargados.
- No depende de red externa para pintar mapas en TV.
- Selección automática de mapa según coordenadas.
- Pin animado con halo.
- Highlight simulado alrededor del origen del vino.
- Zoom dinámico por `viewBox`.
- `label` configurable por mapa.
- `zoom` configurable por mapa.
- Soporte específico para **Islas Canarias**.
- Vista global `journey_europe` para el viaje de la cata.

Mapas soportados:

```text
iberia
france
italy
germany
canaries
journey_europe
```

Ejemplo de entrada en `maps_data.json`:

```json
"canaries": {
  "label": "Islas Canarias",
  "bbox": [-18.5, -13.0, 27.5, 29.6],
  "size": [760, 340],
  "zoom": 2.2,
  "path": "M ... Z"
}
```

---

## 🌍 Viaje de la cata

La pantalla de resumen tiene dos vistas:

```text
Resumen original
Viaje de la cata
```

La vista **Viaje de la cata** usa un mapa único:

```text
journey_europe
```

Este mapa cubre:

- Canarias.
- Península Ibérica.
- Francia.
- Alemania occidental.
- Norte de Italia.
- Europa occidental en general.

La ruta se anima progresivamente:

```text
punto 1 → línea al 2 → punto 2 → línea al 3 → punto 3 → ...
```

La animación está coordinada entre JS y CSS:

```js
const JOURNEY_POINT_DELAY = 0.3;
const JOURNEY_SEGMENT_DELAY = 0.9;
const JOURNEY_STEP = 2;
const JOURNEY_SEGMENT_DURATION = 1.5;
const JOURNEY_POINT_AFTER_SEGMENT = -0.05;
```

Y en CSS:

```css
.journey-segment.animated {
  animation: journey-segment-draw 1.5s ease-out forwards;
}
```

> Importante: si se cambia la duración de `journey-segment-draw` en CSS, hay que mantener sincronizado `JOURNEY_SEGMENT_DURATION` en `app/app-summary.js`.

---

## 🎛️ Control del resumen/viaje

El backend guarda el modo de presentación del resumen:

```json
{
  "summary_auto": true,
  "summary_view": "cards"
}
```

Valores posibles:

```text
summary_auto = true | false
summary_view = "cards" | "journey"
```

Comportamiento:

- `summary_auto: true` → la TV alterna automáticamente entre resumen original y viaje visual.
- `summary_auto: false`, `summary_view: "cards"` → fija el resumen original.
- `summary_auto: false`, `summary_view: "journey"` → fija el viaje visual.

Endpoints:

```http
POST /api/summary-auto
POST /api/summary-view
```

Ejemplo:

```bash
curl -X POST http://localhost:5001/api/summary-view \
  -H "Content-Type: application/json" \
  -d '{"view":"journey"}'
```

---

## 📱 Mapas en móvil

En móvil se usa **Leaflet** con OpenStreetMap.

Características:

- Mapa compacto dentro de la ficha del vino.
- No interactivo para evitar scroll/zoom accidental durante la cata.
- Pin animado con `map-pin-pulse`.
- Zoom móvil ajustado por región.
- Fallback CSS robusto para asegurar que los tiles de Leaflet se posicionan y se muestran correctamente.

Zoom móvil por mapa (en `static/js/app/app-maps.js`):

```js
const mobileZoomByMap = {
  canaries: 7,
  iberia: 6,
  france: 6,
  germany: 6,
  italy: 6,
};
```

Fallback genérico:

```js
const zoom = mobileZoomByMap[key] || 5;
```

---

## 🧯 Fallback CSS de Leaflet móvil

Se incluye un fallback en `app.css` para reforzar las reglas necesarias de Leaflet:

```css
#map-leaflet {
  width: 100%;
  height: 100%;
  min-height: 170px;
  position: relative;
  overflow: hidden;
  background: #ede0bc;
}

#map-leaflet .leaflet-pane,
#map-leaflet .leaflet-map-pane,
#map-leaflet .leaflet-tile-pane,
#map-leaflet .leaflet-overlay-pane,
#map-leaflet .leaflet-shadow-pane,
#map-leaflet .leaflet-marker-pane,
#map-leaflet .leaflet-tooltip-pane,
#map-leaflet .leaflet-popup-pane {
  position: absolute;
  left: 0;
  top: 0;
}

#map-leaflet .leaflet-tile,
#map-leaflet .leaflet-marker-icon,
#map-leaflet .leaflet-marker-shadow {
  position: absolute;
}
```

Motivo: en algunas pruebas móviles/emuladas, los tiles de OpenStreetMap se descargaban correctamente (`naturalWidth: 256`, `naturalHeight: 256`) pero no se pintaban por falta/colisión de estilos de posicionamiento de Leaflet.

---

## 🧪 Debug rápido de mapa móvil

Si el mapa móvil aparece en blanco:

### 1. Verificar que Leaflet existe

```js
document.getElementById('map-leaflet')
```

Debe devolver un `div` con clase `leaflet-container`.

### 2. Verificar tiles

```js
document.querySelectorAll('#map-leaflet .leaflet-tile').length
```

Si devuelve `0`, Leaflet no está generando tiles.

### 3. Verificar si los tiles cargan

```js
[...document.querySelectorAll('#map-leaflet .leaflet-tile')]
  .slice(0, 5)
  .map(img => ({
    src: img.src,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    opacity: getComputedStyle(img).opacity,
    display: getComputedStyle(img).display,
    visibility: getComputedStyle(img).visibility,
    position: getComputedStyle(img).position
  }))
```

Si `naturalWidth` y `naturalHeight` son `256`, los tiles están cargando y el problema es visual/CSS.

---

## 🛠️ Regenerar mapa de Canarias

El proyecto incluye un script para generar el mapa SVG de Canarias desde GeoJSON real:

```text
tools/build_canaries_map.py
```

Uso recomendado:

```bash
python tools/build_canaries_map.py \
  --maps static/maps/maps_data.json \
  --tolerance 0.6
```

Más detalle:

```bash
python tools/build_canaries_map.py \
  --maps static/maps/maps_data.json \
  --tolerance 0.3
```

Menos detalle / archivo más ligero:

```bash
python tools/build_canaries_map.py \
  --maps static/maps/maps_data.json \
  --tolerance 1.2
```

---

## 🛠️ Regenerar mapa `journey_europe`

El proyecto incluye un script para generar el mapa global del viaje:

```text
tools/build_journey_europe_map.py
```

Uso recomendado:

```bash
python tools/build_journey_europe_map.py \
  --maps static/maps/maps_data.json \
  --target-length 12000
```

Más ligero:

```bash
python tools/build_journey_europe_map.py \
  --maps static/maps/maps_data.json \
  --target-length 9000
```

Más detallado:

```bash
python tools/build_journey_europe_map.py \
  --maps static/maps/maps_data.json \
  --target-length 15000
```

La generación del mapa es una tarea de desarrollo. La app Flask no necesita `geopandas` ni `shapely` en runtime si el `maps_data.json` ya está generado.

---

## 🔐 Autenticación

Variables necesarias:

```env
SECRET_KEY=...
ADMIN_PASSWORD=...
```

Nunca subir `.env` al repositorio.

---

## 📱 Flujo de la cata

1. Configurar vinos en `data/wines.json` o desde el editor visual.
2. Arrancar la app.
3. Abrir `/` en TV.
4. Abrir `/control` como anfitrión.
5. Mostrar bienvenida con QR.
6. Invitados escanean el QR.
7. Invitados se registran con nombre y color.
8. El anfitrión empieza la cata.
9. Se muestran vinos uno a uno.
10. Invitados votan desde móvil.
11. La TV muestra votos agregados y popups.
12. Se llega al resumen.
13. El resumen alterna entre tarjetas y viaje visual.
14. El viaje visual se construye animadamente sobre el mapa.
15. Opcionalmente se archiva la sesión.

---

## 🧱 Estructura del proyecto

```text
cata-vinos/
├── app.py
├── requirements.txt
├── Makefile
├── .env.example
├── data/
│   ├── wines.json
│   ├── votes.json
│   ├── _state.json
│   └── archive/              # catas archivadas (fuente de /historico)
├── static/
│   ├── css/
│   │   ├── app.css
│   │   └── control.css
│   ├── js/
│   │   ├── app/
│   │   │   ├── app-core.js       # estado global, isMobile, SSE, renderCurrent
│   │   │   ├── app-maps.js       # MAPS_DATA, renderMap (SVG TV / Leaflet móvil)
│   │   │   ├── app-wine-view.js  # ensureLayout, applyUpdate
│   │   │   ├── app-summary.js    # resumen cards/journey, destacados, rotación
│   │   │   ├── app-welcome.js    # renderWelcome (QRs TV + registro móvil)
│   │   │   ├── app-popups.js     # popups de votos (solo TV)
│   │   │   └── app-voting.js     # identidad, onboarding, voto + bootstrap
│   │   └── control.js
│   ├── maps/
│   │   └── maps_data.json
│   └── photos/
├── templates/
│   ├── app.html
│   ├── control.html
│   ├── historico.html
│   └── login.html
└── tools/
    ├── build_canaries_map.py
    └── build_journey_europe_map.py
```

---

## 🧩 Arquitectura del frontend TV

La pantalla `/` (TV y móvil del invitado comparten la misma página) está dividida
en **módulos por dominio** dentro de `static/js/app/`, en lugar de un único fichero
monolítico. Se cargan como `<script>` clásicos **en orden**, compartiendo el mismo
scope global (no usa ES modules ni build):

```text
app-core.js      Estado global, isMobile(), conexión SSE, renderCurrent, navegación.
                Declara el estado que el resto de módulos comparten. Se carga 1º.
app-maps.js      MAPS_DATA y renderMap: SVG regional en TV, Leaflet en móvil.
app-wine-view.js ensureLayout y applyUpdate de la ficha del vino actual.
app-summary.js   Resumen (tarjetas + viaje), destacados y rotación automática.
app-welcome.js   Pantalla de bienvenida (QRs en TV, bloque de registro en móvil).
app-popups.js    Popups de votos/comentarios (solo TV).
app-voting.js    Identidad, onboarding, voto, borradores + arranque (initApp). Último.
```

Puntos clave de esta arquitectura:

- **Una sola página adaptativa**, no dos apps: TV y móvil se diferencian en runtime
  con `isMobile()` (`window.innerWidth <= 900`), definido en `app-core.js`.
- **El orden de carga importa**: `app-core.js` declara el estado compartido y
  `app-voting.js` se carga el último porque contiene el arranque y el *wrapping* de
  `renderCurrent`/`onServerUpdate`.
- **Diferencias TV vs móvil** localizadas: mapa SVG vs Leaflet (`app-maps.js`),
  popups solo en TV (`app-popups.js`), votación/onboarding solo en móvil
  (`app-voting.js`).

---

## 🚀 Instalación

```bash
git clone https://github.com/agarridob/cata-vinos.git
cd cata-vinos

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

---

## ▶️ Ejecución

### Con Makefile

```bash
make
```

o:

```bash
make dev
```

---

### Manual

```bash
source .venv/bin/activate
flask --app app run --host 0.0.0.0 --port 5001
```

Para probar desde un móvil en la misma WiFi:

```bash
ipconfig getifaddr en0
```

Luego abrir en el móvil:

```text
http://<IP_DEL_MAC>:5001/
```

---

## 🌐 Deploy en servidor

El despliegue recomendado usa:

- usuario dedicado `cata`;
- servicio `systemd`;
- HTTPS con certificados;
- opcionalmente Cloudflare Tunnel.

Ejemplo de servicio `systemd`:

```ini
[Unit]
Description=Cata de Vinos
After=network.target

[Service]
WorkingDirectory=/opt/cata-vinos
ExecStart=/usr/bin/python3 /opt/cata-vinos/app.py
User=cata
Group=cata
Restart=always
EnvironmentFile=/opt/cata-vinos/.env

[Install]
WantedBy=multi-user.target
```

Comandos útiles:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cata-vinos
sudo systemctl restart cata-vinos
sudo systemctl status cata-vinos
```

Logs:

```bash
journalctl -u cata-vinos -f
```

---

## Acceso externo (opcional)

La app sirve en la red local por defecto. Para exponerla a internet de forma
puntual hay un túnel Cloudflare instalado como servicio systemd, parado y
deshabilitado por defecto:

    systemctl start cloudflared    # activar acceso externo
    systemctl stop cloudflared     # desactivar
    systemctl is-active cloudflared

No arranca solo al reiniciar (intencionado): se activa a mano solo cuando se necesita.

---

## 🔌 API principal

Estado y navegación:

```http
GET  /api/state
POST /api/next
POST /api/prev
POST /api/goto/<idx>
POST /api/reload
POST /api/welcome
GET  /stream
```

Editor de vinos:

```http
GET  /api/wines-config
POST /api/wines-config
```

Presentación del resumen:

```http
POST /api/summary-auto
POST /api/summary-view
```

Votación:

```http
POST   /api/vote/<wine_idx>
DELETE /api/vote/<wine_idx>
GET    /api/votes
POST   /api/votes/clear
POST   /api/votes/archive
POST   /api/votes/wipe
```

Invitados:

```http
GET    /api/colors
POST   /api/me
GET    /api/me/<user_id>
PATCH  /api/me/<user_id>
DELETE /api/me/<user_id>
```

Históricos (solo lectura, requieren login):

```http
GET /api/historico              # índice de catas archivadas
GET /api/historico/<archivo>    # JSON completo de una cata
GET /api/historico-wines        # catálogo de vinos agregado entre catas
```

---

## 🗳️ Sistema de votación

Cada invitado puede:

- registrarse con color único;
- elegir nombre o recibir nombre aleatorio de uva;
- votar de 1 a 5 estrellas;
- retirar voto;
- dejar comentario;
- editar su perfil.

La TV muestra:

- agregado medio por vino;
- número de votos;
- popups de votos nuevos;
- popups de comentarios;
- favoritos personales en resumen;
- favorito global de la mesa.

---

## 📦 Estado y datos locales

Archivos locales:

```text
data/_state.json
data/votes.json
data/wines.json
```

`_state.json` guarda:

```json
{
  "current_index": 0,
  "summary_auto": true,
  "summary_view": "cards"
}
```

`votes.json` guarda:

- usuarios;
- colores;
- votos;
- comentarios.

Estos archivos no deberían versionarse salvo que sea intencionado.

---

## 🧪 Checks recomendados

Antes de desplegar:

```bash
python -m py_compile app.py
for f in static/js/app/tv-*.js; do node --check "$f"; done
node --check static/js/control.js
```

Si modificas mapas:

```bash
python tools/build_canaries_map.py \
  --maps static/maps/maps_data.json \
  --tolerance 0.6

python tools/build_journey_europe_map.py \
  --maps static/maps/maps_data.json \
  --target-length 12000
```

---

## 🔐 Seguridad

- Panel `/control` protegido con contraseña.
- Secretos fuera del repo.
- `.env` no versionado.
- Servicio recomendado con usuario no-root.
- Datos locales separados en `data/`.
- Acciones destructivas protegidas con confirmación en frontend.

---

## 🗺️ Roadmap

- Cambiar color de tarjetas de vino en función de espumoso, blanco, rosa, orange o tinto
- Rate limit el login page
- Mejorar la tarjeta de móvil visualmente: mejorar estrellas, campo de comentario. Posiblemente alternar el orden mapa/votar
- ~~Exportar resultados en CSV/JSON.~~
- ~~Histórico visual de sesiones archivadas.~~
- Más mapas regionales.
- Fallback visual para vinos sin coordenadas.
- Mapa mundial opcional para catas no europeas.
- Mejoras de accesibilidad.
- Tests básicos de rutas y API.
- Capturas/GIFs en README.

---

## Licencia

GNU GPL v3

---

## Autor

https://github.com/agarridob

---

## Estado actual

Proyecto funcional para catas reales con:

- TV en directo;
- control de anfitrión;
- invitados móviles;
- votación en tiempo real;
- editor visual de carta;
- mapas SVG en TV;
- Leaflet móvil con fallback CSS robusto;
- Canarias en alta resolución;
- mapa único de Europa para el viaje;
- viaje visual animado de la cata;
- presentación de resumen controlable desde `/control`.
