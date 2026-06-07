# 🍷 Cata de Vinos — In Vino Veritas

Webapp en Flask para organizar una cata de vinos con pantalla principal tipo TV, control desde el móvil y sistema de votación en tiempo real.

La idea es sencilla:

- La pantalla grande muestra el vino actual, su ficha, foto, mapa de origen y votos agregados.
- El anfitrión controla la cata desde `/control`.
- Los invitados se conectan desde el móvil escaneando un QR.
- Cada invitado puede identificarse con nombre y color, votar los vinos y dejar comentarios.
- La pantalla se actualiza en tiempo real usando Server-Sent Events.

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

### Mando de control

Ruta:

```text
/control
```

Permite al anfitrión:

- Avanzar al siguiente vino.
- Retroceder.
- Saltar a un vino concreto.
- Recargar `wines.json` sin reiniciar la app.
- Volver a la pantalla de bienvenida.
- Gestionar votos y usuarios.

---

### Pantalla de bienvenida

Antes de empezar la cata, la app puede mostrar una pantalla de bienvenida con:

- Nombre de la sesión.
- QR para entrar desde el móvil.
- QR opcional para WiFi.
- Lista de invitados registrados.
- Estado de conexión de los participantes.

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

- Iberia
- Francia
- Italia
- Alemania

---

## 🧱 Estructura del proyecto

Estructura orientativa:

```text
cata-vinos/
├── app.py
├── requirements.txt
├── data/
│   ├── wines.json
│   ├── _state.json
│   └── votes.json
├── templates/
│   ├── tv.html
│   └── control.html
├── static/
│   ├── css/
│   │   └── tv.css
│   ├── maps/
│   │   └── maps_data.json
│   └── photos/
│       └── ...
└── README.md
```

---

## 🚀 Instalación

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
pip install -r requirements.txt
```

---

## ▶️ Ejecución local

Puedes arrancar la app con:

```bash
python app.py
```

O, si prefieres usar Flask directamente:

```bash
flask --app app run --host 0.0.0.0 --port 5000
```

Después abre:

```text
http://localhost:5000/
```

Para acceder desde otro dispositivo de la misma red, usa la IP local del equipo:

```text
http://TU_IP_LOCAL:5000/
```

El mando del anfitrión está en:

```text
http://TU_IP_LOCAL:5000/control
```

---

## 🍾 Configuración de vinos

Los vinos se configuran en:

```text
data/wines.json
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

## 🎨 CSS

Los estilos de la pantalla TV están separados en:

```text
static/css/tv.css
```

Esto mantiene `tv.html` más limpio y permite cachear los estilos.

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

### Retroceder vino

```http
POST /api/prev
```

### Ir a un vino concreto

```http
POST /api/goto/<idx>
```

### Recargar vinos

```http
POST /api/reload
```

Recarga `data/wines.json` sin reiniciar el servidor.

### Volver a bienvenida

```http
POST /api/welcome
```

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

### Votar vino

```http
POST /api/vote/<wine_idx>
```

### Borrar voto

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

### Archivar sesión

```http
POST /api/votes/archive
```

### Reset completo de pruebas

```http
POST /api/votes/wipe
```

---

## 🧪 Flujo típico de uso

1. Edita `data/wines.json` con los vinos de la cata.
2. Añade las fotos en `static/photos/`.
3. Arranca la app.
4. Abre `/` en la pantalla grande.
5. Abre `/control` en el móvil o portátil del anfitrión.
6. Los invitados escanean el QR de la pantalla.
7. Cada invitado se identifica con color y nombre.
8. El anfitrión avanza la cata.
9. Los invitados votan y comentan desde el móvil.
10. Al final, se muestra el resumen.

---

## 📱 Recomendaciones de uso

- Usar una pantalla grande o TV para `/`.
- Usar móviles para votar.
- Mantener todos los dispositivos en la misma red WiFi.
- Probar la cata completa antes del evento.
- Usar fotos optimizadas para evitar cargas pesadas.
- Reiniciar votos antes de una nueva sesión o archivar la anterior.

---

## 🛠️ Desarrollo

Durante desarrollo, puede ser útil forzar recarga de estáticos cambiando la versión en los enlaces CSS/JS:

```html
<link rel="stylesheet" href="{{ url_for('static', filename='css/tv.css') }}?v=1.0.8">
```

También puedes abrir directamente los ficheros estáticos para comprobar que Flask los sirve correctamente:

```text
http://localhost:5000/static/css/tv.css
http://localhost:5000/static/maps/maps_data.json
```

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

Para pruebas, se pueden limpiar desde los endpoints de administración o borrando los ficheros correspondientes.

---

## 🔐 Notas de seguridad

Esta app está pensada para uso local o en una red controlada durante una cata.

Si se expone a Internet, conviene revisar:

- autenticación del panel `/control`,
- endpoints administrativos,
- HTTPS,
- límites de escritura,
- limpieza de datos personales de invitados.

---

## 🗺️ Roadmap posible

Ideas para futuras mejoras:

- ~~Sacar también el JavaScript a `static/js/tv.js`.~~
- Añadir autenticación para el panel de control.
- Exportar resultados de la cata a CSV o JSON.
- Añadir modo histórico de sesiones.
- Añadir edición visual de vinos desde `/control`.
- Mejorar lazy-loading de mapas por región.
- Añadir soporte para más países.
- Añadir tema oscuro o variantes visuales.

---

## Licencia

Este proyecto está licenciado bajo la **GNU General Public License v3.0**.

Consulta el archivo [`LICENSE`](LICENSE) para más detalles.

---

## Autor

Proyecto personal de https://github.com/agarridob para organizar catas de vino con pantalla compartida, control móvil y votación en directo.
