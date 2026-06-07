# 🍷 Cata de Vinos

Servicio web ligero para catas en casa: muestra el vino actual en la TV (con foto, ficha completa y mapa de la D.O.) y se controla desde el móvil. Incluye sistema de votación en tiempo real para todos los invitados.

## Características

- **Vista TV** fullscreen con foto de la botella, datos del vino y mapa interactivo de la D.O.
- **Mando para móvil** — avanza/retrocede vinos y salta a cualquiera de la lista
- **Sistema de votación** — cada invitado puntúa (1-5 ★) y comenta cada vino desde su móvil
- **Pantalla de bienvenida** con lista de vinos y código QR/wifi para que se unan los invitados
- **Pantalla resumen final** con el favorito de la mesa, el más polarizante, el unánime y los comentarios destacados
- **Actualizaciones en tiempo real** vía Server-Sent Events (SSE) — la TV se actualiza sola
- **Estado persistido** — si el servicio se reinicia, vuelve al vino donde estabas
- **Archivado de sesiones** — guarda la cata completa (vinos, usuarios, votos) en JSON histórico
- **HTTPS** con redirección automática HTTP → HTTPS
- **Resolución automática de coordenadas** por D.O. (más de 80 denominaciones españolas e internacionales)


## Vistas

| URL | Descripción |
|-----|-------------|
| `https://<host>/` | Pantalla TV — fullscreen, se actualiza sola |
| `https://<host>/control` | Mando para el anfitrión — navega entre vinos |


## Estructura

```
/opt/cata-vinos/
├── app.py                    # backend Flask (SSE, votación, archivado, HTTPS)
├── templates/
│   ├── tv.html               # vista TV
│   └── control.html          # mando del anfitrión + vista de invitados
├── static/
│   └── photos/               # fotos de las botellas (jpg/png/webp)
├── data/
│   ├── wines.json            # lista de vinos y configuración de la sesión
│   ├── votes.json            # usuarios y votos (generado)
│   ├── _state.json           # índice persistido (generado)
│   └── archive/              # sesiones archivadas (generado)
├── requirements.txt
└── cata-vinos.service
```


## Instalación en un LXC nuevo

### 1. Crear LXC en Proxmox

```bash
pct create 103 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname cata-vinos \
  --cores 1 --memory 512 --swap 256 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.0.81/24,gw=192.168.0.1 \
  --nameserver 192.168.0.184 \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1
```

### 2. Setup dentro del LXC

```bash
pct enter 103

apt update && apt install -y python3 python3-pip python3-flask
mkdir -p /opt/cata-vinos
```

Copia los archivos del proyecto a `/opt/cata-vinos/` (vía `scp` o como hagas habitualmente).

### 3. (Opcional) Certificado SSL

Si quieres HTTPS, coloca el certificado en:

```
/etc/ssl/cata-vinos/fullchain.pem
/etc/ssl/cata-vinos/privkey.pem
```

Si los ficheros no existen, la app arranca igualmente en modo HTTP en el puerto 8080.

### 4. Instalar servicio systemd

```bash
cp /opt/cata-vinos/cata-vinos.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cata-vinos
systemctl status cata-vinos
```

### 5. Probar

- `https://<host>/` → pantalla TV con el primer vino
- `https://<host>/control` → mando del anfitrión


## Configurar la sesión (`wines.json`)

```json
{
  "session": "Cata Hinojal · Junio 2025",
  "wifi": {
    "show": "true/false",
    "ssid": "MiRed",
    "password": "contraseña"
  },
  "wines": [
    {
      "name": "Único 2018",
      "winery": "Vega Sicilia",
      "vintage": 2018,
      "do": "Ribera del Duero",
      "grape": "Tempranillo, Cabernet Sauvignon",
      "region": "Valbuena de Duero, Valladolid",
      "photo": "unico2018.jpg",
      "curiosity": "Texto opcional. Si se omite, el bloque desaparece."
    }
  ]
}
```

### Campos de cada vino

| Campo | ¿Obligatorio? | Descripción |
|-------|:---:|-------------|
| `name` | ✅ | Nombre del vino |
| `winery` | ✅ | Bodega |
| `vintage` | ✅ | Añada |
| `do` | ✅ | Denominación de Origen |
| `grape` | ✅ | Variedad/es de uva |
| `region` | ❌ | Si falta, se usa la D.O. |
| `photo` | ❌ | Nombre del fichero en `static/photos/`. Si falta, se muestra un placeholder |
| `curiosity` | ❌ | Texto libre. Si está vacío, el bloque desaparece y el mapa ocupa el espacio |
| `coords` | ❌ | `[lat, lon]`. Si no se indica, se resuelve automáticamente por D.O. |

Tras editar el JSON, pulsa "↻ Recargar wines.json" en el mando, o:

```bash
systemctl restart cata-vinos
```


## Sistema de votación

Cada invitado accede desde su móvil, elige un **nombre** (o uno de uva aleatorio) y un **color de marcador de copa**. Desde ahí puede:

- Puntuar cada vino de 1 a 5 estrellas
- Añadir un comentario libre (hasta 140 caracteres)
- Ver la media de votos de la mesa en tiempo real

Al llegar a la pantalla resumen, la TV muestra automáticamente:

- 🏆 **El favorito de la mesa** — mejor media con mínimo 2 votos
- 🎭 **Sin consenso** — mayor desviación típica (mín. 3 votos)
- 🤝 **Todos coincidieron** — buena media con baja dispersión
- 💬 **Comentarios destacados** — uno por uno, con nombre y color del autor

### Gestión de sesiones

El anfitrión puede desde el mando:

- **Archivar sesión** — guarda todo en `data/archive/YYYY-MM-DD_nombre.json` y resetea para la siguiente cata
- **Borrar votos** — limpia votos manteniendo usuarios (útil para repetir)
- **Wipe completo** — borra todo sin archivar (modo pruebas)
- **Expulsar invitado** — elimina usuario y sus votos


## Fotos de botellas

Copia las imágenes a `/opt/cata-vinos/static/photos/`. Recomendaciones:

- Formato vertical (botella)
- Fondo transparente (PNG/WebP) queda más elegante; sobre fondo blanco también funciona
- No hace falta alta resolución — 600 px de alto es suficiente


## API

```
GET  /api/state              → estado completo (vino actual, votos, usuarios)
POST /api/next               → avanza al siguiente vino
POST /api/prev               → retrocede
POST /api/goto/<idx>         → salta a vino concreto (0-indexed)
POST /api/reload             → recarga wines.json sin reiniciar
POST /api/welcome            → vuelve a la pantalla de bienvenida

GET  /api/colors             → lista de 30 colores con flag 'taken'
POST /api/me                 → crea o recupera usuario  { user_id?, name?, color? }
GET  /api/me/<user_id>       → datos del usuario y sus votos
PATCH /api/me/<user_id>      → actualiza nombre y/o color
DELETE /api/me/<user_id>     → expulsa al invitado

POST /api/vote/<wine_idx>    → vota/actualiza  { user_id, score?: 1-5, comment?: str }
DELETE /api/vote/<wine_idx>  → elimina el voto  ?user_id=<id>
GET  /api/votes              → resumen por vino + destacados

POST /api/votes/archive      → archiva la sesión  { name?: str }
POST /api/votes/clear        → borra votos, mantiene usuarios
POST /api/votes/wipe         → borra TODO sin archivar

GET  /stream                 → Server-Sent Events (la TV se suscribe aquí)
```

Ejemplo:

```bash
curl -X POST https://192.168.0.81/api/next
curl -X POST https://192.168.0.81/api/vote/0 \
  -H "Content-Type: application/json" \
  -d '{"user_id":"abc123","score":4,"comment":"Muy frutal"}'
```


## Integración con Home Assistant

Puedes controlar la cata desde automaciones o dashboards de HA:

```yaml
# Avanzar al siguiente vino desde un botón de HA
service: rest_command.cata_next
```

```yaml
# En configuration.yaml
rest_command:
  cata_next:
    url: "https://<host>/api/next"
    method: POST
  cata_prev:
    url: "https://<host>/api/prev"
    method: POST
```