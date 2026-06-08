# 🍷 Cata de Vinos — In Vino Veritas

Webapp en **Flask** para organizar una cata de vinos con pantalla principal tipo TV, panel de control para el anfitrión, edición visual de la carta, gestión de invitados y sistema de votación en tiempo real.

La app está pensada para una dinámica de cata compartida:

- La pantalla grande muestra la bienvenida, el vino actual, ficha, foto, mapa de origen, votos agregados y resumen final.
- El anfitrión controla la cata desde `/control`.
- El panel está protegido con autenticación.
- El panel está organizado en pestañas: **Cata**, **Invitados**, **Carta** y **Admin**.
- Los invitados entran desde el móvil escaneando un QR.
- Cada invitado puede identificarse con nombre y color, votar vinos y dejar comentarios.
- La pantalla se actualiza en directo mediante **Server-Sent Events**.
- La carta de vinos puede editarse visualmente desde el panel de control.
- La configuración WiFi puede gestionarse desde la pestaña **Admin**.
- La pantalla TV usa mapas SVG regionales, con zoom dinámico y soporte para viaje visual de la cata.

---

## 🚀 Desarrollo rápido

```bash
make
```

Por defecto lanza la app en modo desarrollo.

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
  - automático cada 15 segundos;
  - fijar resumen original;
  - fijar viaje visual de la cata.

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

## 🗺️ Mapas

La app usa dos estrategias diferentes según dispositivo:

### TV / escritorio

En pantallas grandes se usan **mapas SVG locales**, porque Leaflet no renderizaba correctamente en televisión.

Características:

- SVG regionales precargados desde `static/maps/maps_data.json`.
- Selección automática de mapa según coordenadas.
- Pin animado con halo.
- Highlight simulado alrededor del origen del vino.
- Zoom dinámico por `viewBox`.
- `label` configurable por mapa.
- `zoom` configurable por mapa.
- Soporte específico para **Islas Canarias** con geometría generada desde GeoJSON real.

Mapas soportados:

```text
iberia
france
italy
germany
canaries
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

### Móvil

En móviles se usa **Leaflet** con OpenStreetMap:

- Vista compacta.
- Pin animado.
- Mapa no interactivo para evitar scroll/zoom accidental durante la cata.

---

## 🌍 Viaje de la cata

La pantalla de resumen tiene dos vistas:

```text
Resumen original
Viaje de la cata
```

Por defecto, la TV alterna automáticamente cada 15 segundos entre ambas vistas.

Desde `/control`, el anfitrión puede:

- reactivar automático;
- fijar el resumen original;
- fijar el viaje visual.

El estado se controla con:

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

Endpoints asociados:

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
14. Opcionalmente se archiva la sesión.

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
│   └── _state.json
├── static/
│   ├── css/
│   │   ├── tv.css
│   │   └── control.css
│   ├── js/
│   │   ├── tv.js
│   │   └── control.js
│   ├── maps/
│   │   └── maps_data.json
│   └── photos/
├── templates/
│   ├── tv.html
│   ├── control.html
│   └── login.html
└── tools/
    └── build_canaries_map.py
```

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

### Comandos disponibles

```bash
make dev      # modo desarrollo
make run      # modo simple
make install  # instalar dependencias
make freeze   # actualizar requirements.txt
```

---

### Manual

```bash
source .venv/bin/activate
flask --app app run --host 0.0.0.0 --port 5001
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

## 🔐 Seguridad

- Panel `/control` protegido con contraseña.
- Secretos fuera del repo.
- `.env` no versionado.
- Servicio recomendado con usuario no-root.
- Datos locales separados en `data/`.
- Acciones destructivas protegidas con confirmación en frontend.

---

## 🧪 Checks recomendados

Antes de desplegar:

```bash
python -m py_compile app.py
node --check static/js/tv.js
node --check static/js/control.js
```

Si modificas mapas:

```bash
python tools/build_canaries_map.py \
  --maps static/maps/maps_data.json \
  --tolerance 0.6
```

---

## 🗺️ Roadmap

- Exportar resultados en CSV/JSON.
- Histórico visual de sesiones archivadas.
- Más mapas regionales.
- Mapa global para viaje de cata multi-país.
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
- Leaflet móvil;
- viaje visual de la cata;
- presentación de resumen controlable desde `/control`.
