# Cata de Vinos

Servicio web ligero para catas en casa: muestra el vino actual en la TV
(con foto, datos y mapa de la D.O.) y se controla desde el móvil.

## Vistas

- **TV** → `http://192.168.0.81:8080/` — pantalla fullscreen, se actualiza
  sola en tiempo real cuando avanzas el vino desde el móvil (SSE).
- **Móvil** → `http://192.168.0.81:8080/control` — botones Anterior/Siguiente
  y lista de vinos para saltar a cualquiera tocándolo.

## Estructura

```
/opt/cata-vinos/
├── app.py                  # backend Flask
├── templates/
│   ├── tv.html             # vista TV
│   └── control.html        # vista móvil
├── static/
│   └── photos/             # fotos de las botellas (jpg/png/webp)
├── data/
│   ├── wines.json          # lista de vinos de la cata
│   └── _state.json         # índice persistido (generado)
├── requirements.txt
└── cata-vinos.service
```

## Instalación en un LXC nuevo

### 1. Crear LXC en Proxmox

Desde el host Proxmox, ajustando IDs y plantilla según tu setup:

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

Copia los archivos del proyecto a `/opt/cata-vinos/` (vía `scp` desde tu
máquina, o como hagas habitualmente). Estructura final:

```
/opt/cata-vinos/app.py
/opt/cata-vinos/templates/tv.html
/opt/cata-vinos/templates/control.html
/opt/cata-vinos/data/wines.json
/opt/cata-vinos/static/photos/   (vacío al inicio)
/opt/cata-vinos/cata-vinos.service
```

### 3. Instalar servicio systemd

```bash
cp /opt/cata-vinos/cata-vinos.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cata-vinos
systemctl status cata-vinos
```

### 4. Probar

Desde el navegador:
- `http://192.168.0.81:8080/` → debería ver la primera ficha de vino
- `http://192.168.0.81:8080/control` → mando para avanzar

## Editar la lista de vinos

Edita `/opt/cata-vinos/data/wines.json`. Estructura por vino:

```json
{
  "name": "Nombre del vino",
  "winery": "Bodega",
  "vintage": 2020,
  "do": "Ribera del Duero",
  "grape": "Tempranillo, Cabernet",
  "region": "Peñafiel, Valladolid",
  "photo": "carraovejas.jpg",
  "curiosity": "Texto opcional. Si se omite, no aparece el bloque."
}
```

Campos:
- **name, winery, vintage, do, grape** — obligatorios para que se vea bien.
- **region** — opcional. Si falta, se usa la D.O.
- **photo** — opcional. Nombre del fichero dentro de `static/photos/`.
  Si falta o no existe, se muestra un placeholder.
- **curiosity** — opcional. Si está vacío, el bloque desaparece y el mapa
  ocupa el espacio.
- **coords** — opcional. `[lat, lon]`. Si no se indica y la D.O. está en
  la tabla interna (la mayoría de las españolas y las grandes internacionales
  ya están), se resuelve automáticamente.

Tras editar el JSON, pulsa el botón "↻ Recargar wines.json" en el control
móvil, o reinicia el servicio:

```bash
systemctl restart cata-vinos
```

## Fotos de botellas

Copia las imágenes a `/opt/cata-vinos/static/photos/`. Recomendaciones:
- Aspecto vertical (formato botella).
- Fondo transparente (PNG/WebP) queda más elegante; sobre fondo blanco
  también funciona.
- No hace falta resolución alta — 600px de alto sobra.

## API (por si quieres integrarla con HA o atajos de Siri)

```
GET  /api/state            → { wine, index, total, all_titles, session }
POST /api/next             → avanza
POST /api/prev             → retrocede
POST /api/goto/<idx>       → salta a vino concreto (0-indexed)
POST /api/reload           → recarga wines.json
```

Ejemplo con curl:
```bash
curl -X POST http://192.168.0.81:8080/api/next
```
