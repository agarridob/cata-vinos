# Development and utility commands for cata-vinos

.DEFAULT_GOAL := dev

# Usamos el intérprete del venv directamente (vía `python -m ...`) en lugar de
# `source .venv/bin/activate`. El activate guarda la ruta absoluta del venv a la
# hora de crearlo, así que se rompe si mueves el proyecto de carpeta; invocar el
# python del venv por su ruta es inmune a eso.
PY := .venv/bin/python

# Lanzar en dev (con recarga automática)
dev:
	FLASK_APP=app.py FLASK_DEBUG=1 $(PY) -m flask run --host=0.0.0.0 --port=5001

# Instalar dependencias
install:
	$(PY) -m pip install -r requirements.txt

# Actualizar requirements.txt
freeze:
	$(PY) -m pip freeze > requirements.txt

# Arranque rápido sin debug (tipo prod local)
run:
	$(PY) -m flask --app app run --host 0.0.0.0 --port 5001

# Traer del servidor las fotos y la carta actual (lo subido desde el panel).
# Usa ssh + tar (el servidor no tiene rsync); en el servidor solo lee.
# Las fotos no se borran en local; el wines.json local se guarda antes en
# data/wines.json.local.
DEPLOY_HOST ?= cata-vinos
DEPLOY_DIR  ?= /opt/cata-vinos

sync-down:
	@[ -f data/wines.json ] && cp data/wines.json data/wines.json.local || true
	ssh $(DEPLOY_HOST) 'tar -C $(DEPLOY_DIR) -cf - static/photos data/wines.json' | tar -xf -
	@echo "Fotos: $$(ls static/photos | grep -ciE '\.(png|jpe?g|webp|gif)$$') · sin versionar: $$(git ls-files --others static/photos | grep -ciE '\.(png|jpe?g|webp|gif)$$') (ignoradas)"
