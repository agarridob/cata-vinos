# 🍷 Cata de Vinos — In Vino Veritas

Webapp en **Flask** para organizar una cata de vinos con pantalla principal tipo TV, panel de control para el anfitrión, edición visual de la carta y sistema de votación en tiempo real.

La app está pensada para una dinámica de cata compartida:

- La pantalla grande muestra el vino actual, ficha, foto, mapa de origen y votos agregados.
- El anfitrión controla la cata desde `/control`.
- El panel de control está protegido con autenticación.
- Los invitados entran desde el móvil escaneando un QR.
- Cada invitado puede identificarse con nombre y color, votar vinos y dejar comentarios.
- La pantalla se actualiza en directo mediante **Server-Sent Events**.
- La carta de vinos puede editarse visualmente desde el panel de control.

---

## ✨ Funcionalidades

### Pantalla TV

Ruta principal:

```text
/
```

Muestra:

- Nombre de la sesión.
- Vino actual.
- Bodega.
- Añada.
- D.O.
- Uva.
- Región.
- Puntuación externa, si existe.
- Curiosidad o nota del vino.
- Foto de botella.
- Mapa de origen.
- Progreso de la cata.
- Votos agregados en directo.

---

### Panel de control del anfitrión

Ruta:

```text
/control
```

El panel está protegido por login. Permite al anfitrión:

- Avanzar al siguiente vino.
- Retroceder.
- Saltar a un vino concreto.
- Recargar `wines.json` sin reiniciar la app.
- Volver a la pantalla de bienvenida.
- Gestionar invitados.
- Limpiar votos.
- Archivar sesión y reiniciar.
- Borrar todo en modo pruebas.
- Editar visualmente la carta de vinos.

---

### Editor visual de vinos

Desde `/control`, el anfitrión puede cargar y editar visualmente el contenido de:

```text
data/wines.json
```

El editor permite:

- Cargar la carta actual.
- Editar nombre de sesión.
- Editar los campos principales de cada vino.
- Añadir vinos nuevos.
- Duplicar vinos existentes.
- Eliminar vinos.
- Reordenar vinos.
- Guardar cambios en `wines.json`.
- Refrescar automáticamente la pantalla TV tras guardar.

Campos editables por vino:

- Nombre.
- Bodega.
- Añada.
- D.O.
- Uva.
- Región.
- Rating.
- Foto.
- Latitud.
- Longitud.
- Curiosidad.

Al guardar desde el editor, el backend valida mínimamente los datos, sobrescribe `data/wines.json`, recarga el estado de la app y emite una actualización a las pantallas conectadas.

---

### Autenticación del panel de control

La app usa sesión de Flask y variables de entorno para proteger el panel de anfitrión.

Rutas relacionadas:

```text
/login
/logout
/control
```

Variables necesarias:

```env
SECRET_KEY=...
ADMIN_PASSWORD=...
```

Estas variables **no deben subirse a GitHub**. Se configuran en un archivo `.env` local/servidor o mediante variables de entorno del sistema.

---

### Pantalla de bienvenida

Antes de empezar la cata, la app puede mostrar una pantalla de bienvenida con:

- Nombre de la sesión.
- QR para entrar desde el móvil.
- QR opcional para WiFi.
- Lista de invitados registrados.
- Estado de conexión de participantes.

---

### Votación desde móvil

Los invitados pueden:

- Elegir un color identificativo.
- Indicar nombre opcional.
- Votar cada vino de 1 a 5 estrellas.
- Escribir comentarios.
- Editar su perfil.
- Revisar vinos anteriores sin adelantarse al anfitrión.

---

### Resumen final

Al terminar la cata, la app muestra una pantalla resumen con:

- Todos los vinos catados.
- Votos medios.
- Número de votos.
- Favorito de la mesa.
- Favoritos personales.
- Comentarios destacados.

---

### Mapas

La app muestra mapas de origen:

- En móvil usa Leaflet/OpenStreetMap.
- En TV/desktop usa mapas SVG regionales cargados desde:

```text
static/maps/maps_data.json
```

Actualmente incluye mapas regionales para:

- Iberia.
- Francia.
- Italia.
- Alemania.

---

## 🧱 Estructura del proyecto

Estructura orientativa:

```text
cata-vinos/
├── app.py
├── requirements.txt
├── .env.example
├── data/
│   └── wines.example.json
├── deploy/
│   └── cata-vinos.service.example
├── templates/
│   ├── tv.html
│   ├── control.html
│   └── login.html
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
│       └── ...
└── README.md
```

Archivos locales no versionados:

```text
.env
data/wines.json
data/_state.json
data/votes.json
data/wines.backup-*.json
.venv/
```

---

## 🚀 Instalación local

### 1. Clonar el repositorio

```bash
git clone https://github.com/agarridob/cata-vinos.git
cd cata-vinos
```

### 2. Crear entorno virtual

```bash
python3 -m venv .venv
source .venv/bin/activate
```

En Windows:

```powershell
python -m venv .venv
.venv\Scripts\activate
```

### 3. Instalar dependencias

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

---

## 🔐 Configuración de secretos

La app necesita dos variables:

```env
SECRET_KEY=...
ADMIN_PASSWORD=...
```

### Generar `SECRET_KEY`

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

### Crear `.env`

En la raíz del proyecto:

```bash
cp .env.example .env
```

Edita `.env`:

```env
SECRET_KEY=pega_aqui_la_secret_key_generada
ADMIN_PASSWORD=elige_una_password_para_el_panel
```

> Importante: `.env` está ignorado por Git y no debe subirse nunca al repositorio.

---

## ▶️ Ejecución local

Con el entorno virtual activo:

```bash
python app.py
```

O usando Flask directamente:

```bash
flask --app app run --host 0.0.0.0 --port 5000
```

Si el puerto 5000 está ocupado:

```bash
flask --app app run --host 0.0.0.0 --port 5001
```

Después abre:

```text
http://localhost:5000/
```

o:

```text
http://localhost:5001/
```

El panel de control está en:

```text
http://localhost:5000/control
```

La primera vez redirigirá a:

```text
/login?next=/control
```

---

## 🍾 Configuración de vinos

Los vinos se configuran en:

```text
data/wines.json
```

El repositorio incluye una plantilla versionada:

```text
data/wines.example.json
```

Para empezar:

```bash
cp data/wines.example.json data/wines.json
```

Ejemplo básico:

```json
{
  "session": "Cata · Hinojal",
  "wifi": {
    "show": true,
    "ssid": "NombreWifi",
    "password": "ContraseñaWifi"
  },
  "wines": [
    {
      "name": "Viña Ejemplo Reserva",
      "winery": "Bodega Ejemplo",
      "vintage": "2019",
      "do": "Rioja",
      "grape": "Tempranillo",
      "region": "La Rioja",
      "rating": "Peñín 92",
      "curiosity": "Un vino perfecto para explicar la crianza en barrica.",
      "photo": "vina-ejemplo.png",
      "coords": [42.46, -2.45]
    }
  ]
}
```

### Campos soportados

| Campo | Descripción |
|---|---|
| `name` | Nombre del vino |
| `winery` | Bodega |
| `vintage` | Añada |
| `do` | Denominación de origen |
| `grape` | Uva o coupage |
| `region` | Región visible en la ficha |
| `rating` | Puntuación externa opcional |
| `curiosity` | Nota o curiosidad mostrada en pantalla |
| `photo` | Nombre de archivo en `static/photos/` |
| `coords` | Coordenadas `[lat, lon]` |

Si un vino no trae `coords`, la app intenta resolverlas automáticamente a partir de la D.O. cuando está definida en la tabla interna de coordenadas.

---

## 🖼️ Fotos de botellas

Las fotos deben colocarse en:

```text
static/photos/
```

Y referenciarse desde `wines.json`:

```json
{
  "photo": "mi-vino.png"
}
```

Formatos recomendados:

- `.png`
- `.jpg`
- `.webp`

Para mejores resultados en TV, usa imágenes con fondo transparente o fondo limpio.

---

## 🗺️ Datos de mapas

Los mapas SVG regionales están separados del HTML en:

```text
static/maps/maps_data.json
```

Esto evita que `tv.html` tenga un bloque enorme de datos embebidos y permite que el navegador cachee el JSON.

Estructura:

```json
{
  "iberia": {
    "bbox": [-10, 4, 35.5, 44],
    "size": [560, 340],
    "path": "M..."
  }
}
```

Cada mapa contiene:

- `bbox`: límites geográficos.
- `size`: tamaño del SVG.
- `path`: geometría SVG del mapa.

---

## 🎨 Frontend estático

Las vistas principales usan HTML limpio y recursos estáticos separados:

```text
templates/tv.html
static/css/tv.css
static/js/tv.js


templates/control.html
static/css/control.css
static/js/control.js

static/maps/maps_data.json
```

Esto mantiene las plantillas más legibles y permite al navegador cachear CSS, JS y datos de mapas.

Para evitar caché durante desarrollo, se puede versionar el JS/CSS en la plantilla:

```html
<link rel="stylesheet" href="{{ url_for('static', filename='css/control.css') }}?v=1.0.12">
<script src="{{ url_for('static', filename='js/control.js') }}?v=1.0.12"></script>
```

---

## 🔌 API principal

### Estado actual

```http
GET /api/state
```

Devuelve el estado actual de la cata.

### Avanzar vino

```http
POST /api/next
```

Protegido: requiere autenticación de anfitrión.

### Retroceder vino

```http
POST /api/prev
```

Protegido: requiere autenticación de anfitrión.

### Ir a un vino concreto

```http
POST /api/goto/<idx>
```

Protegido: requiere autenticación de anfitrión.

### Recargar vinos

```http
POST /api/reload
```

Recarga `data/wines.json` sin reiniciar el servidor.

Protegido: requiere autenticación de anfitrión.

### Configuración editable de vinos

```http
GET /api/wines-config
POST /api/wines-config
```

Endpoints usados por el editor visual del panel `/control`.

Protegidos: requieren autenticación de anfitrión.

### Volver a bienvenida

```http
POST /api/welcome
```

Protegido: requiere autenticación de anfitrión.

### Stream en tiempo real

```http
GET /stream
```

Usa Server-Sent Events para actualizar la pantalla TV y móviles en tiempo real.

---

## 🗳️ API de votación

### Colores disponibles

```http
GET /api/colors
```

### Crear usuario

```http
POST /api/me
```

### Obtener usuario

```http
GET /api/me/<user_id>
```

### Editar usuario

```http
PATCH /api/me/<user_id>
```

### Eliminar usuario

```http
DELETE /api/me/<user_id>
```

Protegido: requiere autenticación de anfitrión.

### Votar vino

```http
POST /api/vote/<wine_idx>
```

### Borrar voto propio

```http
DELETE /api/vote/<wine_idx>?user_id=<user_id>
```

### Resumen de votos

```http
GET /api/votes
```

### Borrar votos

```http
POST /api/votes/clear
```

Protegido: requiere autenticación de anfitrión.

### Archivar sesión

```http
POST /api/votes/archive
```

Protegido: requiere autenticación de anfitrión.

### Reset completo de pruebas

```http
POST /api/votes/wipe
```

Protegido: requiere autenticación de anfitrión.

---

## 🧪 Flujo típico de uso

1. Edita `data/wines.json` manualmente o desde el editor visual de `/control`.
2. Añade fotos en `static/photos/`.
3. Arranca la app.
4. Abre `/` en la pantalla grande.
5. Abre `/control` en el dispositivo del anfitrión.
6. Inicia sesión con la contraseña de anfitrión.
7. Los invitados escanean el QR de la pantalla.
8. Cada invitado se identifica con color y nombre.
9. El anfitrión avanza la cata.
10. Los invitados votan y comentan desde el móvil.
11. Al final, se muestra el resumen.
12. Opcionalmente, archiva la sesión desde `/control`.

---

## 📦 Estado persistente

La app usa ficheros en `data/` para mantener estado:

```text
data/_state.json
data/votes.json
```

Estos archivos permiten conservar:

- vino actual,
- usuarios registrados,
- votos,
- comentarios.

No se versionan en Git.

---

## 🚢 Deploy en servidor

El servidor usa un entorno virtual en:

```text
/opt/cata-vinos/.venv
```

Y el servicio systemd:

```text
cata-vinos.service
```

### 1. Primer despliegue en servidor

```bash
cd /opt/cata-vinos
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Crea el `.env` del servidor:

```bash
nano /opt/cata-vinos/.env
```

Contenido:

```env
SECRET_KEY=secret_key_generada
ADMIN_PASSWORD=password_del_panel
```

Permisos recomendados:

```bash
chmod 600 /opt/cata-vinos/.env
```

---

### 2. Configuración systemd

El repo incluye una plantilla en:

```text
deploy/cata-vinos.service.example
```

El servicio real debe vivir en:

```text
/etc/systemd/system/cata-vinos.service
```

Ejemplo:

```ini
[Unit]
Description=Cata de Vinos — servicio web para TV y control móvil
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cata-vinos
EnvironmentFile=/opt/cata-vinos/.env
ExecStart=/opt/cata-vinos/.venv/bin/python /opt/cata-vinos/app.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Después de editar:

```bash
systemctl daemon-reload
systemctl restart cata-vinos.service
```

Comprobar estado:

```bash
systemctl status cata-vinos.service
```

Ver logs:

```bash
journalctl -u cata-vinos.service -f
```

---

### 3. Flujo habitual de deploy

Cada vez que se despliegue una nueva versión:

```bash
cd /opt/cata-vinos
git pull
source .venv/bin/activate
python -m pip install -r requirements.txt
systemctl restart cata-vinos.service
```

Si no han cambiado dependencias, el paso de `pip install` puede omitirse, aunque ejecutarlo no suele causar problema.

---

## 🔐 Seguridad

Esta app está pensada para uso local, LAN o despliegue controlado durante una cata.

Medidas actuales:

- Panel `/control` protegido por login.
- Endpoints administrativos protegidos con sesión de anfitrión.
- Secretos fuera del código mediante `.env`.
- `.env`, `.venv/`, certificados y estado en vivo ignorados por Git.
- Servicio systemd real fuera del repo; el repo solo incluye una plantilla de despliegue.

Si se expone a Internet, conviene revisar adicionalmente:

- HTTPS y certificados.
- Contraseña robusta para `ADMIN_PASSWORD`.
- Usuario de sistema no-root para el servicio.
- Rate limiting en `/login`.
- Backups y limpieza de datos personales.

---

## 🛠️ Desarrollo

### Actualizar dependencias

En local:

```bash
source .venv/bin/activate
python -m pip install <paquete>
python -m pip freeze > requirements.txt
```

Después:

```bash
git add requirements.txt
git commit -m "Update dependencies"
git push
```

### Comprobar que no se suben secretos

```bash
git status
git ls-files | grep -E '^\.env|^\.venv|^data/'
```

Lo normal es que solo aparezca:

```text
data/wines.example.json
```

---

## 🗺️ Roadmap posible

Ideas para futuras mejoras:

- Añadir usuario de sistema dedicado para el servicio en vez de `root`.
- Añadir rate limiting al login.
- Exportar resultados de la cata a CSV o JSON.
- Añadir modo histórico de sesiones.
- Mejorar lazy-loading de mapas por región.
- Añadir soporte para más países.
- Añadir capturas al README.
- Añadir tests básicos de endpoints.

---

## Licencia

Este proyecto está licenciado bajo la **GNU General Public License v3.0**.

Consulta el archivo [`LICENSE`](LICENSE) para más detalles.

---

## Autor

Proyecto personal de [agarridob](https://github.com/agarridob) para organizar catas de vino con pantalla compartida, control móvil, edición visual de carta y votación en directo.
