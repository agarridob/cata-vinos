# Development and utility commands for cata-vinos

.DEFAULT_GOAL := dev

# Activar entorno virtual y lanzar en dev
dev:
	source .venv/bin/activate && \
	export FLASK_APP=app.py && \
	export FLASK_ENV=development && \
	flask run --host=0.0.0.0 --port=5001

# Instalar dependencias
install:
	source .venv/bin/activate && pip install -r requirements.txt

# Actualizar requirements.txt
freeze:
	source .venv/bin/activate && pip freeze > requirements.txt

# Arranque rápido sin debug (tipo prod local)
run:
	source .venv/bin/activate && flask --app app run --host 0.0.0.0 --port 5001
