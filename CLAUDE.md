# CLAUDE.md — convenciones del proyecto

## Versión (¡bump en cada cambio!)

Hay un número de versión visible en la pantalla TV (`app.html`, `<div id="version-tag">`)
que sirve para saber de un vistazo si se está viendo la última versión desplegada.

**Cada vez que se haga cualquier cambio, hay que subir esa versión.** El número
vive en dos sitios y deben ir siempre en sincronía:

- `templates/app.html` — el tag visible `v X.Y.Z` **y** los `?v=X.Y.Z` de cada CSS/JS.
- `templates/control.html` — los `?v=X.Y.Z` de `control.css` y `control.js`.

Los `?v=X.Y.Z` no son cosméticos: son **cache-busting**. Subirlos fuerza a los
navegadores (TV y móviles) a recargar el JS/CSS nuevo tras un deploy, en vez de
servir la versión cacheada. Mantén el mismo número en `app.html` y `control.html`.

Versión actual: **2.2.1**.

Convención de incremento (semver informal):
- correcciones pequeñas → patch (1.1.0 → 1.1.1)
- features → minor (1.1.x → 1.3.0)

## Despliegue

El servidor corre como servicio systemd (`cata-vinos.service`) en `/opt/cata-vinos`.
Nos conectamos por SSH con el host `cata-vinos` (192.168.0.81) **como root**, así que
los comandos van **sin `sudo`** (p. ej. `systemctl restart cata-vinos`, no `sudo ...`).
Tras `git pull` hay que **reiniciar** (`systemctl restart cata-vinos`): sin debug,
Jinja cachea las plantillas en memoria y no recarga `templates/*.html` hasta reiniciar.
`data/` (wines.json, archive/) es git-ignored y no se toca con el pull.

### Runtime y dependencias (¡ojo!)

El servicio arranca con **`/usr/bin/python3.11`** (Python del sistema, paquetes
Debian en `dist-packages`), **NO** con el `.venv` del repo. El `ExecStart` real es
`/usr/bin/python3.11 /opt/cata-vinos/app.py`. El `.venv` existe pero el servicio
no lo usa.

Consecuencia: cuando un cambio añade una dependencia nueva, **instálala en el
Python del sistema, no en el venv**, o el servicio no arrancará (`ModuleNotFoundError`).
Debian es *externally-managed* (PEP 668), así que lo limpio es vía apt:

    apt-get install -y python3-<paquete>        # p. ej. python3-jwt, python3-cryptography

`requirements.txt` es para desarrollo local (venv); no refleja lo que usa el servicio.

## Autenticación del panel (`/control`, `/historico` y `/api/*` de escritura)

Dos capas, y **la que aplica depende de por qué puerta entras**, no de la red:

- **`catas.hinojal.app/...`** → siempre pasa por Cloudflare (DNS público, incluso
  desde la LAN) → **Cloudflare Access** pide login (código por email). Tras validar,
  la app confía en el JWT firmado y da admin sin contraseña.
- **`192.168.0.81/...`** (IP local, saltándose Cloudflare) → no hay JWT → cae al
  **login por contraseña** (`ADMIN_PASSWORD`, con rate-limit). Fallback para entrar
  si el túnel/Cloudflare están caídos.

Config de CF Access en `.env` del servidor (git-ignored): `CF_ACCESS_TEAM_DOMAIN`,
`CF_ACCESS_AUD`, `CF_ACCESS_EMAILS`. Sin esas variables, solo funciona la contraseña.

Cada **página** protegida por internet necesita ser una *destination* en la app de
Cloudflare Access (hoy: `/control` y `/historico`). Los `/api/*` NO necesitan
destination: se llaman por `fetch` con la cookie `CF_Authorization` ya presente en
el hostname, que la app valida. Si añades una página protegida nueva, acuérdate de
darla de alta como destination en Access.

## Estado global y SSE (arquitectura)

El estado vive en memoria en `app.py`: `state` (dict, protegido por `state_lock`)
y el estado de votos (`votes_state`, protegido por `votes_lock`). El control (panel
del anfitrión) cambia el estado por `POST /api/*`, y la TV + los móviles reciben el
nuevo estado en tiempo real por **SSE** (`GET /stream`). El ciclo es siempre:
mutar `state` bajo el lock → `save_persisted_state()` → `broadcast_update()`, que
serializa `current_payload()` y lo empuja a cada cliente conectado.

**Gotcha (deadlock):** `state_lock` es un `threading.Lock` normal, **no reentrante**.
`current_payload()` y `broadcast_update()` **toman `state_lock` por dentro**, así que
NUNCA los llames mientras ya tienes el lock cogido. Patrón correcto: haz las mutaciones
dentro del `with state_lock:`, marca una bandera (`changed`/`on_wine`), y llama a
`broadcast_update()` / `return jsonify(current_payload())` **fuera** del `with`.

El cliente (TV) recibe cada payload en `onServerUpdate()` (`static/js/app/app-core.js`).
`isMobile()` (ancho ≤ 900) decide TV vs móvil: bastantes cosas (popups de voto, banner
de aviso, mapas SVG vs Leaflet) son solo-TV o solo-móvil.

### Señales one-shot a la TV vía "nonce"

Para lanzar una acción puntual en la TV desde el control (no un cambio de estado
persistente), usamos un **contador que solo sube**: el endpoint incrementa
`state['<algo>_nonce']`, se incluye en el payload, y la TV actúa cuando ve un valor
**mayor que el último** que registró (guardando el nonce inicial como baseline, sin
disparar). Así una TV que se reconecta a mitad no re-dispara acciones viejas. Estos
contadores son **transitorios** (no se persisten; vuelven a 0 al reiniciar el servicio).

## Aviso de voto en la TV (`app-vote-alert.js`)

Banner "¡Hora de votar el Vino X!" **solo en la TV** (la pantalla compartida; los
avisos en el móvil no llegan con la pantalla bloqueada). Al entrar en un vino no
sale nada y el cambio de vino es instantáneo. El banner aparece:

- **Automático:** a los 5 min de entrar en el vino; se oculta al minuto.
- **Manual:** botón «📣 Lanzar aviso de voto» del panel → `POST /api/vote-alert`
  (sube `alert_nonce`); se oculta a los 30 s.
- **Quitar:** botón «🚫 Quitar popup» → `POST /api/vote-alert/hide` (sube
  `alert_hide_nonce`); oculta el banner al instante.

`syncVoteAlert(payload)` (solo TV) es por eventos: muestra el banner solo en esos
momentos y lo oculta con temporizador; una vez oculto **no reaparece** en los
siguientes updates. El sonido es una campanita generada con **WebAudio** (sin fichero),
desbloqueada con el primer gesto del usuario en la TV (típicamente el botón de
pantalla completa). Duraciones y retardo son constantes al principio del archivo
(`VOTE_REMINDER_DELAY_MS`, `VOTE_AUTO_HIDE_MS`, `VOTE_MANUAL_HIDE_MS`).

## Modo duelo — "Viejo Mundo vs Nuevo Mundo" (`app-duel-view.js`)

Cata temática por **parejas** (una uva = dos vinos, europeo vs nuevo mundo). Se
activa **por sesión** con `"mode": "duelo"` en `wines.json`; sin ese campo todo
funciona como siempre (catas normales e histórico intactos). La lista `wines` es
plana y las parejas van **consecutivas**: pareja k = vinos `2k` (Viejo) y `2k+1`
(Nuevo). Cada vino añade `world` (`"viejo"`/`"nuevo"`), `duel` (nombre de la uva
para la cabecera) y opcional `duel_note` (el "qué buscar").

- **TV:** una pantalla por uva (`renderDuel`, solo TV): cabecera con la uva, dos
  columnas enfrentadas y un **mapamundi** (`buildWorldMapSVG` en `app-maps.js`,
  entrada `world` en `maps_data.json`) con los dos orígenes unidos por un arco. La
  TV deriva la pareja del índice (`floor(index/2)`) y resalta el vino actual.
- **Móvil:** sigue votando **vino a vino** (voto normal). En el 2º vino de cada
  pareja aparece el toggle **¿Viejo o Nuevo?** (`renderPairVoteBlock`), que llama a
  `POST /api/pair-vote/<pair_idx>` (`{user_id, choice}`). Los votos de preferencia
  viven en `votes_state['pair_votes']` y se agregan en `pair_votes_summary()`.
- **Control:** "Siguiente" avanza vino a vino como siempre; la tarjeta muestra
  "Uva N/4 · 🌍/🌎". Interruptor **Modo Duelo** (`POST /api/mode` con `{duelo}`) que
  hace de indicador (verde/burdeos "ACTIVO") y permite activarlo/desactivarlo en
  vivo; es un override de sesión (no se persiste), la carta `wines.json` marca el
  valor por defecto al arrancar o al cargar carta. Botón nuevo **⚔️ Lanzar ¿Viejo o
  Nuevo?** → `POST /api/pref-alert`
  (sube `pref_alert_nonce`, transitorio): banner en la TV (`syncPrefAlert`) + resalta
  el toggle en los móviles. En modo duelo el **auto-aviso de 5 min se desactiva**
  (solo avisos manuales).
- **Resumen:** marcador global "🌍 Viejo X – Y Nuevo 🌎" + ganador por uva
  (`duelScoreboardHtml`). Empate en una uva = no suma a ningún bando.
