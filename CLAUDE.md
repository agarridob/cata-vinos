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

Versión actual: **1.5.3**.

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
