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

Versión actual: **1.1.5**.

Convención de incremento (semver informal):
- correcciones pequeñas → patch (1.1.0 → 1.1.1)
- features → minor (1.1.x → 1.2.0)

## Despliegue

El servidor corre como servicio systemd (`cata-vinos.service`, `.venv/bin/python app.py`).
En el servidor nos conectamos **como root**, así que los comandos van **sin `sudo`**
(p. ej. `systemctl restart cata-vinos`, no `sudo systemctl ...`).
Tras `git pull` hay que **reiniciar** (`systemctl restart cata-vinos`): sin debug,
Jinja cachea las plantillas en memoria y no recarga `templates/*.html` hasta reiniciar.
`data/` (wines.json, archive/) es git-ignored y no se toca con el pull.
