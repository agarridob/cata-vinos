#!/usr/bin/env python3
"""
Cata de Vinos — servicio web para mostrar el vino actual en TV
y controlarlo desde el móvil.

Vistas:
  /          → pantalla TV (fullscreen)
  /control   → mando para móvil

API:
  GET  /api/state            → estado actual (JSON)
  POST /api/next             → avanza al siguiente vino
  POST /api/prev             → retrocede
  POST /api/goto/<idx>       → salta a un vino concreto
  POST /api/reload           → recarga wines.json sin reiniciar
  GET  /stream               → Server-Sent Events para la TV
"""

import json
import os
import queue
import random
import statistics
import threading
import uuid
from datetime import datetime
from functools import wraps
from http.server import BaseHTTPRequestHandler, HTTPServer

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, session, redirect, url_for

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')

if not app.secret_key:
    raise RuntimeError("Falta SECRET_KEY en variables de entorno")

if not ADMIN_PASSWORD:
    raise RuntimeError("Falta ADMIN_PASSWORD en variables de entorno")

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, 'data')
WINES_FILE  = os.path.join(DATA_DIR, 'wines.json')
STATE_FILE  = os.path.join(DATA_DIR, '_state.json')

# ─────────────────────────────────────────────────────────────────────────────
# Tabla de coordenadas por D.O. — si un vino no trae "coords" en el JSON,
# intentamos resolver por su D.O. para que el mapa siga funcionando.
# Coordenadas aproximadas del centro de cada zona.
# ─────────────────────────────────────────────────────────────────────────────
DO_COORDS = {
    # España
    "Rioja": [42.46, -2.45],
    "Ribera del Duero": [41.50, -3.70],
    "Priorat": [41.20, 0.80],
    "Rías Baixas": [42.40, -8.70],
    "Toro": [41.52, -5.39],
    "Jerez": [36.68, -6.13],
    "Jerez-Xérès-Sherry": [36.68, -6.13],
    "Manzanilla": [36.78, -6.35],
    "Manzanilla-Sanlúcar de Barrameda": [36.78, -6.35],
    "Cava": [41.36, 1.71],
    "Penedès": [41.36, 1.71],
    "Montsant": [41.20, 0.85],
    "Bierzo": [42.55, -6.60],
    "Somontano": [42.10, 0.07],
    "Navarra": [42.50, -1.65],
    "Valdepeñas": [38.76, -3.39],
    "La Mancha": [39.50, -3.50],
    "Yecla": [38.62, -1.12],
    "Jumilla": [38.48, -1.32],
    "Cigales": [41.74, -4.69],
    "Rueda": [41.41, -4.96],
    "Calatayud": [41.35, -1.64],
    "Cariñena": [41.34, -1.21],
    "Campo de Borja": [41.83, -1.45],
    "Empordà": [42.27, 3.06],
    "Costers del Segre": [41.55, 0.70],
    "Pla de Bages": [41.73, 1.83],
    "Conca de Barberà": [41.42, 1.20],
    "Tarragona": [41.12, 1.25],
    "Terra Alta": [40.96, 0.50],
    "Alella": [41.50, 2.30],
    "Utiel-Requena": [39.49, -1.16],
    "Valencia": [39.47, -0.38],
    "Alicante": [38.35, -0.48],
    "Almansa": [38.87, -1.10],
    "Méntrida": [40.24, -4.20],
    "Manchuela": [39.36, -1.84],
    "Ribeiro": [42.27, -8.13],
    "Valdeorras": [42.43, -7.07],
    "Ribeira Sacra": [42.40, -7.50],
    "Monterrei": [41.92, -7.46],
    "Vinos de Madrid": [40.42, -3.70],
    "Sierra de Salamanca": [40.50, -6.10],
    "Arribes": [41.10, -6.50],
    "Tierra de León": [42.60, -5.50],
    "Bullas": [38.05, -1.67],
    "Lanzarote": [29.04, -13.59],
    "Tacoronte-Acentejo": [28.47, -16.40],
    "Málaga": [36.72, -4.42],
    "Sierras de Málaga": [36.72, -4.42],
    "Condado de Huelva": [37.27, -6.55],
    # Internacionales comunes
    "Bordeaux": [44.84, -0.58],
    "Burdeos": [44.84, -0.58],
    "Burgundy": [47.04, 4.83],
    "Bourgogne": [47.04, 4.83],
    "Borgoña": [47.04, 4.83],
    "Champagne": [49.05, 4.04],
    "Côtes du Rhône": [44.30, 4.85],
    "Chianti": [43.50, 11.30],
    "Brunello di Montalcino": [43.06, 11.49],
    "Barolo": [44.62, 7.94],
    "Barbaresco": [44.72, 8.08],
    "Prosecco": [45.88, 12.25],
    "Douro": [41.18, -7.55],
    "Porto": [41.18, -7.55],
    "Oporto": [41.18, -7.55],
    "Vinho Verde": [41.50, -8.43],
    "Mendoza": [-32.89, -68.85],
    "Napa Valley": [38.50, -122.27],
    "Sonoma": [38.50, -122.83],
    "Mosel": [49.93, 7.10],
    "Rheingau": [50.00, 8.00],
    "Tokaj": [48.13, 21.41],
}

# ─────────────────────────────────────────────────────────────────────────────
# Estado global
# ─────────────────────────────────────────────────────────────────────────────
state_lock = threading.Lock()
state = {
    'session_name': 'Cata · Hinojal',
    'current_index': 0,
    'wines': [],
    'wifi': None,
}

# Lista de queues, una por cada cliente SSE conectado
listeners = []
listeners_lock = threading.Lock()


def load_wines():
    try:
        with open(WINES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return (
            data.get('session', state['session_name']),
            data.get('wines', []),
            data.get('wifi'),
        )
    except Exception as e:
        print(f"[load_wines] Error: {e}")
        return state['session_name'], [], None


def save_persisted_state():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            json.dump({'current_index': state['current_index']}, f)
    except Exception as e:
        print(f"[save_state] Error: {e}")


def load_persisted_state():
    try:
        with open(STATE_FILE, 'r') as f:
            return int(json.load(f).get('current_index', 0))
    except Exception:
        return 0


def enrich_wine(wine):
    """Añade coords resueltas por D.O. si el vino no las trae explícitas."""
    if 'coords' in wine and wine['coords']:
        return wine
    do = wine.get('do', '').strip()
    if do and do in DO_COORDS:
        out = dict(wine)
        out['coords'] = DO_COORDS[do]
        return out
    return wine


def current_payload():
    with state_lock:
        idx   = state['current_index']
        wines = list(state['wines'])
        session_name = state['session_name']
        wifi_cfg = state.get('wifi')
    # Info pública de usuarios (para mostrar nombres+colores en destacados/comentarios)
    with votes_lock:
        users_public = {
            uid: {'name': u.get('name'), 'color': u.get('color')}
            for uid, u in votes_state['users'].items()
        }
    v_summary = votes_summary()

    if not wines:
        return {
            'session': session_name,
            'wine': None,
            'index': 0,
            'total': 0,
            'is_summary': False,
            'is_welcome': False,
            'all_titles': [],
            'all_wines': [],
            'votes_summary': v_summary,
            'users_public': users_public,
        }

    # Índice -1: pantalla de bienvenida (antes de empezar la cata)
    if idx < 0:
        return {
            'session': session_name,
            'wine': None,
            'index': -1,
            'total': len(wines),
            'is_summary': False,
            'is_welcome': True,
            'all_titles': [
                {'name': w.get('name', ''), 'winery': w.get('winery', '')}
                for w in wines
            ],
            'all_wines': [enrich_wine(w) for w in wines],
            'votes_summary': v_summary,
            'users_public': users_public,
            'wifi_config': wifi_cfg,
        }
    # Índice especial: idx == len(wines) significa "pantalla resumen"
    if idx >= len(wines):
        idx = len(wines)
        return {
            'session': session_name,
            'wine': None,
            'index': idx,
            'total': len(wines),
            'is_summary': True,
            'is_welcome': False,
            'all_titles': [
                {'name': w.get('name', ''), 'winery': w.get('winery', '')}
                for w in wines
            ],
            'all_wines': [enrich_wine(w) for w in wines],
            'votes_summary': v_summary,
            'users_public': users_public,
            'highlights': calculate_highlights(wines),
            'personal_favorites': calculate_personal_favorites(),
        }
    idx = max(0, idx)
    # Votos individuales del vino actual (para los popups en TV)
    with votes_lock:
        wine_key = str(idx)
        current_wine_votes = {
            uid: {
                'score': uv[wine_key].get('score'),
                'comment': uv[wine_key].get('comment', ''),
            }
            for uid, uv in votes_state['votes'].items()
            if wine_key in uv
        }
    return {
        'session': session_name,
        'wine': enrich_wine(wines[idx]),
        'index': idx,
        'total': len(wines),
        'is_summary': False,
        'is_welcome': False,
        'all_titles': [
            {'name': w.get('name', ''), 'winery': w.get('winery', '')}
            for w in wines
        ],
        'all_wines': [enrich_wine(w) for w in wines],
        'votes_summary': v_summary,
        'users_public': users_public,
        'current_wine_votes': current_wine_votes,
    }


def broadcast_update():
    payload = current_payload()
    msg = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    with listeners_lock:
        for q in list(listeners):
            try:
                q.put_nowait(msg)
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Sistema de votación
# ─────────────────────────────────────────────────────────────────────────────
VOTES_FILE = os.path.join(DATA_DIR, 'votes.json')

# 30 colores (los marcadores físicos de copa)
COLORS = [
    {"key": "red",        "name": "Rojo",          "hex": "#C0392B"},
    {"key": "cherry",     "name": "Cereza",        "hex": "#D6455D"},
    {"key": "coral",      "name": "Coral",         "hex": "#E55B4D"},
    {"key": "salmon",     "name": "Salmón",        "hex": "#E89A82"},
    {"key": "fuchsia",    "name": "Fucsia",        "hex": "#D63384"},
    {"key": "bubblegum",  "name": "Chicle",        "hex": "#E87FB0"},
    {"key": "pink",       "name": "Rosa",          "hex": "#EB8DA8"},
    {"key": "babyPink",   "name": "Rosa pastel",   "hex": "#F4C2C2"},
    {"key": "orange",     "name": "Naranja",       "hex": "#E67E22"},
    {"key": "terracota",  "name": "Terracota",     "hex": "#C26044"},
    {"key": "yellow",     "name": "Amarillo",      "hex": "#F1C40F"},
    {"key": "lime",       "name": "Lima",          "hex": "#A8D24A"},
    {"key": "green",      "name": "Verde",         "hex": "#6FA936"},
    {"key": "darkGreen",  "name": "Verde oscuro",  "hex": "#2D7A3E"},
    {"key": "mint",       "name": "Menta",         "hex": "#5DBE9C"},
    {"key": "seafoam",    "name": "Verde agua",    "hex": "#B5E0C9"},
    {"key": "turquoise",  "name": "Turquesa",      "hex": "#4FB3A0"},
    {"key": "aqua",       "name": "Aqua",          "hex": "#5BCDD6"},
    {"key": "sky",        "name": "Azul cielo",    "hex": "#7CC1E8"},
    {"key": "steelBlue",  "name": "Azul acero",    "hex": "#8FA8C0"},
    {"key": "blue",       "name": "Azul",          "hex": "#3F86C9"},
    {"key": "periwinkle", "name": "Azul lavanda",  "hex": "#8095D6"},
    {"key": "navy",       "name": "Marino",        "hex": "#2C4A7F"},
    {"key": "lilac",      "name": "Lila",          "hex": "#B19CD9"},
    {"key": "violet",     "name": "Violeta",       "hex": "#8E5BAC"},
    {"key": "purple",     "name": "Morado",        "hex": "#6C3F8E"},
    {"key": "brown",      "name": "Marrón",        "hex": "#8B5A3C"},
    {"key": "gray",       "name": "Gris",          "hex": "#95A5A6"},
    {"key": "white",      "name": "Blanco",        "hex": "#ECEFF1"},
    {"key": "black",      "name": "Negro",         "hex": "#2C3E50"},
]

GRAPE_NAMES = [
    "Tempranillo", "Garnacha", "Albariño", "Verdejo", "Mencía",
    "Monastrell", "Bobal", "Cariñena", "Mazuelo", "Graciano",
    "Forcallá", "Mandó", "Manzoni Bianco", "Pedro Ximénez", "Moscatel",
    "Viura", "Macabeo", "Xarel·lo", "Parellada", "Godello",
    "Treixadura", "Listán Negro", "Negramoll", "Sumoll", "Trepat",
    "Tinta de Toro", "Brancellao", "Sousón", "Maturana", "Malvasía",
]

votes_state = {'users': {}, 'votes': {}}
votes_lock = threading.Lock()


def load_votes():
    global votes_state
    if os.path.exists(VOTES_FILE):
        try:
            with open(VOTES_FILE) as f:
                loaded = json.load(f)
                votes_state['users'] = loaded.get('users', {})
                votes_state['votes'] = loaded.get('votes', {})
        except Exception as e:
            print(f"[votes] error al cargar: {e}")


def save_votes():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = VOTES_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(votes_state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, VOTES_FILE)
    except Exception as e:
        print(f"[votes] error al guardar: {e}")


def _taken_colors(exclude_user=None):
    return {
        u.get('color')
        for uid, u in votes_state['users'].items()
        if uid != exclude_user and u.get('color')
    }


def _taken_names(exclude_user=None):
    return {
        (u.get('name') or '').strip()
        for uid, u in votes_state['users'].items()
        if uid != exclude_user and u.get('name')
    }


def _pick_random_grape_name():
    taken = _taken_names()
    available = [g for g in GRAPE_NAMES if g not in taken]
    if available:
        return random.choice(available)
    return f"Invitado {len(votes_state['users']) + 1}"


def _pick_random_color():
    taken = _taken_colors()
    available = [c['key'] for c in COLORS if c['key'] not in taken]
    if available:
        return random.choice(available)
    return None


def votes_summary():
    """Devuelve por cada índice de vino: {avg, count}."""
    summary = {}
    with votes_lock:
        for user_id, user_votes in votes_state['votes'].items():
            for wine_idx_str, vote_data in user_votes.items():
                score = vote_data.get('score')
                if score is None:
                    continue
                idx = int(wine_idx_str)
                if idx not in summary:
                    summary[idx] = {'scores': [], 'count': 0}
                summary[idx]['scores'].append(score)
                summary[idx]['count'] += 1
    result = {}
    for idx, data in summary.items():
        result[str(idx)] = {
            'avg': round(sum(data['scores']) / data['count'], 1),
            'count': data['count'],
        }
    return result


def calculate_personal_favorites():
    """Para cada usuario, identifica su(s) vino(s) favorito(s) (max score >= 4).
    Devuelve {wine_idx_str: [user_id, ...]}.
    """
    with votes_lock:
        all_votes = {uid: dict(uv) for uid, uv in votes_state['votes'].items()}

    result = {}
    for user_id, user_votes in all_votes.items():
        # Encontrar el max score del usuario
        max_score = 0
        for wine_idx_str, vote_data in user_votes.items():
            score = vote_data.get('score')
            if score and score > max_score:
                max_score = score
        if max_score < 4:
            continue  # No resaltar si nada le entusiasmó

        # Añadir al usuario en cada vino donde dio ese max score
        for wine_idx_str, vote_data in user_votes.items():
            if vote_data.get('score') == max_score:
                result.setdefault(wine_idx_str, []).append(user_id)
    return result


def calculate_highlights(wines):
    """Calcula los destacados rotativos para la pantalla resumen."""
    highlights = []
    with votes_lock:
        users = dict(votes_state['users'])
        all_votes = {uid: dict(uv) for uid, uv in votes_state['votes'].items()}

    # Agrupar votos por vino
    wine_votes = {}
    for user_id, user_votes in all_votes.items():
        for wine_idx_str, vote_data in user_votes.items():
            idx = int(wine_idx_str)
            wine_votes.setdefault(idx, []).append({
                'user_id': user_id,
                'score': vote_data.get('score'),
                'comment': (vote_data.get('comment') or '').strip(),
            })

    # 1. Favorito: mejor media con mínimo 2 votos
    candidates = []
    for idx, votes in wine_votes.items():
        scores = [v['score'] for v in votes if v.get('score')]
        if len(scores) >= 2 and idx < len(wines):
            avg = sum(scores) / len(scores)
            candidates.append((idx, avg, len(scores)))
    if candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        max_avg = candidates[0][1]
        for fav_idx, avg, count in candidates:
            if avg < max_avg:
                break
            wine = wines[fav_idx]
            highlights.append({
                'type': 'favorite',
                'label': 'El favorito de la mesa',
                'wine_idx': fav_idx,
                'wine_name': wine.get('name', ''),
                'winery': wine.get('winery', ''),
                'avg': round(avg, 1),
                'count': count,
            })

    # 2. Polarizante: mayor desviación (min 3 votos, stdev > 0.8)
    polarizing_cand = []
    for idx, votes in wine_votes.items():
        scores = [v['score'] for v in votes if v.get('score')]
        if len(scores) >= 3 and idx < len(wines):
            sd = statistics.stdev(scores)
            if sd > 0.8:
                polarizing_cand.append((idx, sd, min(scores), max(scores)))
    if polarizing_cand:
        polarizing_cand.sort(key=lambda x: x[1], reverse=True)
        best_idx, sd, mn, mx = polarizing_cand[0]
        wine = wines[best_idx]
        highlights.append({
            'type': 'polarizing',
            'label': 'Sin consenso',
            'wine_idx': best_idx,
            'wine_name': wine.get('name', ''),
            'min_score': mn,
            'max_score': mx,
        })

    # 3. Unánime: stdev bajo y buena media (min 3 votos, avg>=3.5, stdev<0.6)
    unan_cand = []
    for idx, votes in wine_votes.items():
        scores = [v['score'] for v in votes if v.get('score')]
        if len(scores) >= 3 and idx < len(wines):
            avg = sum(scores) / len(scores)
            sd = statistics.stdev(scores) if len(scores) > 1 else 0
            if avg >= 3.5 and sd < 0.6:
                unan_cand.append((idx, avg, sd))
    if unan_cand:
        unan_cand.sort(key=lambda x: x[2])  # menor stdev primero
        best_idx, avg, sd = unan_cand[0]
        # Solo si no es ya el favorito (evitar duplicado)
        if not any(h['type'] == 'favorite' and h['wine_idx'] == best_idx for h in highlights):
            wine = wines[best_idx]
            highlights.append({
                'type': 'unanimous',
                'label': 'Todos coincidieron',
                'wine_idx': best_idx,
                'wine_name': wine.get('name', ''),
                'avg': round(avg, 1),
            })

    # 4. Comentarios destacados (>=5 caracteres)
    for idx, votes in wine_votes.items():
        if idx >= len(wines):
            continue
        wine = wines[idx]
        for vote in votes:
            comment = vote.get('comment') or ''
            if len(comment) >= 5:
                user = users.get(vote['user_id'], {})
                highlights.append({
                    'type': 'comment',
                    'label': 'Comentario',
                    'wine_idx': idx,
                    'wine_name': wine.get('name', ''),
                    'comment': comment,
                    'user_name': user.get('name', '—'),
                    'user_color': user.get('color', 'gray'),
                })

    return highlights

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if session.get('is_admin'):
            return fn(*args, **kwargs)

        if request.path.startswith('/api/'):
            return jsonify({'error': 'unauthorized'}), 401

        return redirect(url_for('login', next=request.path))

    return wrapper

# ─────────────────────────────────────────────────────────────────────────────
# Rutas
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/')
def tv():
    return render_template('tv.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None

    if request.method == 'POST':
        password = request.form.get('password', '')

        if password == ADMIN_PASSWORD:
            session['is_admin'] = True
            next_url = request.args.get('next') or url_for('control')
            return redirect(next_url)

        error = 'Contraseña incorrecta'

    return render_template('login.html', error=error)

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/control')
@admin_required
def control():
    return render_template('control.html')


@app.route('/api/state')
def api_state():
    return jsonify(current_payload())


@app.route('/api/next', methods=['POST'])
@admin_required
def api_next():
    with state_lock:
        # Permite avanzar desde -1 (bienvenida) hasta len(wines) (resumen)
        if state['wines'] and state['current_index'] < len(state['wines']):
            state['current_index'] += 1
    save_persisted_state()
    broadcast_update()
    return jsonify(current_payload())


@app.route('/api/prev', methods=['POST'])
@admin_required
def api_prev():
    with state_lock:
        # Permite retroceder hasta -1, que representa la pantalla de bienvenida
        if state['current_index'] > -1:
            state['current_index'] -= 1
    save_persisted_state()
    broadcast_update()
    return jsonify(current_payload())


@app.route('/api/goto/<int:idx>', methods=['POST'])
@admin_required
def api_goto(idx):
    with state_lock:
        # 0..len-1 son vinos; len es la pantalla de resumen
        if state['wines'] and 0 <= idx <= len(state['wines']):
            state['current_index'] = idx
    save_persisted_state()
    broadcast_update()
    return jsonify(current_payload())


@app.route('/api/reload', methods=['POST'])
@admin_required
def api_reload():
    """Recarga wines.json sin reiniciar el servicio."""
    session_name, wines, wifi = load_wines()
    with state_lock:
        state['session_name'] = session_name
        state['wines'] = wines
        state['wifi'] = wifi
        # Recortar al rango válido (0..len, donde len = pantalla resumen)
        if state['current_index'] > len(wines):
            state['current_index'] = max(0, len(wines))
    save_persisted_state()
    broadcast_update()
    return jsonify({'status': 'ok', 'count': len(wines), 'session': session_name})

@app.route('/api/wines-config', methods=['GET'])
@admin_required
def api_wines_config_get():
    """
    Devuelve el contenido editable de data/wines.json.
    Solo anfitrión.
    """
    try:
        with open(WINES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({
            'session': state.get('session_name', 'Cata'),
            'wifi': None,
            'wines': [],
        })
    except Exception as e:
        print(f"[wines-config GET] Error: {e}")
        return jsonify({'error': 'read_failed'}), 500


@app.route('/api/wines-config', methods=['POST'])
@admin_required
def api_wines_config_save():
    """
    Guarda data/wines.json desde el editor visual del control.
    Solo anfitrión.
    """
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({'error': 'invalid_json'}), 400

    session_name = (data.get('session') or state.get('session_name') or 'Cata').strip()
    wines = data.get('wines', [])
    wifi = data.get('wifi', None)

    if not isinstance(wines, list):
        return jsonify({'error': 'wines_must_be_list'}), 400

    cleaned_wines = []

    for i, wine in enumerate(wines):
        if not isinstance(wine, dict):
            return jsonify({'error': f'wine_{i}_must_be_object'}), 400

        cleaned = {}

        # Campos texto conocidos
        for field in [
            'name',
            'winery',
            'vintage',
            'do',
            'grape',
            'region',
            'rating',
            'curiosity',
            'photo',
        ]:
            value = wine.get(field, '')
            if value is None:
                value = ''
            cleaned[field] = str(value).strip()

        # coords opcional: [lat, lon]
        coords = wine.get('coords')
        if coords in (None, '', []):
            pass
        elif (
            isinstance(coords, list)
            and len(coords) == 2
            and coords[0] not in ('', None)
            and coords[1] not in ('', None)
        ):
            try:
                cleaned['coords'] = [float(coords[0]), float(coords[1])]
            except (TypeError, ValueError):
                return jsonify({'error': f'wine_{i}_coords_invalid'}), 400
        else:
            return jsonify({'error': f'wine_{i}_coords_invalid'}), 400

        # Evitar guardar vinos completamente vacíos
        if any(cleaned.get(k) for k in ['name', 'winery', 'do', 'grape', 'photo']):
            cleaned_wines.append(cleaned)

    out = {
        'session': session_name,
        'wines': cleaned_wines,
    }

    if wifi is not None:
        out['wifi'] = wifi

    try:
        os.makedirs(DATA_DIR, exist_ok=True)

        tmp = WINES_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        os.replace(tmp, WINES_FILE)

        # Recargar estado en memoria
        new_session_name, new_wines, new_wifi = load_wines()

        with state_lock:
            state['session_name'] = new_session_name
            state['wines'] = new_wines
            state['wifi'] = new_wifi

            if state['current_index'] > len(new_wines):
                state['current_index'] = max(0, len(new_wines))

        save_persisted_state()
        broadcast_update()

        return jsonify({
            'status': 'ok',
            'session': new_session_name,
            'count': len(new_wines),
        })

    except Exception as e:
        print(f"[wines-config POST] Error: {e}")
        return jsonify({'error': 'save_failed'}), 500    


# ───── Endpoints de votación ─────

@app.route('/api/colors', methods=['GET'])
def api_colors():
    """Lista de colores con flag 'taken'."""
    with votes_lock:
        taken = _taken_colors()
    return jsonify([
        {**c, 'taken': c['key'] in taken}
        for c in COLORS
    ])


@app.route('/api/me', methods=['POST'])
def api_me_create():
    """Crea o devuelve un usuario.

    Body: { user_id?: str, name?: str, color?: str }
    Si user_id existe → devuelve sus datos
    Si no → crea uno nuevo con name (o uva aleatoria) y color (o aleatorio libre)
    """
    data = request.get_json(silent=True) or {}
    incoming_user_id = data.get('user_id')

    with votes_lock:
        # ¿Usuario existente?
        if incoming_user_id and incoming_user_id in votes_state['users']:
            user = votes_state['users'][incoming_user_id]
            return jsonify({'user_id': incoming_user_id, **user, 'is_new': False})

        # Crear nuevo. Si el cliente manda su propio user_id lo respetamos: así
        # un reintento del mismo POST (red floja) cae en la rama "usuario
        # existente" de arriba y es idempotente — nunca crea un duplicado.
        user_id = incoming_user_id or str(uuid.uuid4())
        name = (data.get('name') or '').strip() or _pick_random_grape_name()

        requested_color = data.get('color')
        if requested_color:
            # Coherente con el PATCH: si el color lo tiene OTRO, devolvemos 409
            # en vez de reasignar en silencio. El cliente reintenta con otro.
            if requested_color in _taken_colors():
                return jsonify({'error': 'color_taken'}), 409
            color = requested_color
        else:
            color = _pick_random_color()

        votes_state['users'][user_id] = {'name': name, 'color': color}
        save_votes()

    broadcast_update()
    return jsonify({'user_id': user_id, 'name': name, 'color': color, 'is_new': True})


@app.route('/api/me/<user_id>', methods=['GET'])
def api_me_get(user_id):
    """Devuelve datos del usuario y sus votos."""
    with votes_lock:
        user = votes_state['users'].get(user_id)
        if not user:
            return jsonify({'error': 'not_found'}), 404
        my_votes = dict(votes_state['votes'].get(user_id, {}))
    return jsonify({'user_id': user_id, **user, 'votes': my_votes})


@app.route('/api/me/<user_id>', methods=['PATCH'])
def api_me_update(user_id):
    """Cambia nombre y/o color del usuario."""
    data = request.get_json(silent=True) or {}
    with votes_lock:
        if user_id not in votes_state['users']:
            return jsonify({'error': 'not_found'}), 404
        user = votes_state['users'][user_id]
        if 'name' in data:
            name = (data['name'] or '').strip()
            user['name'] = name if name else _pick_random_grape_name()
        if 'color' in data:
            new_color = data['color']
            if new_color:
                others = _taken_colors(exclude_user=user_id)
                if new_color in others:
                    return jsonify({'error': 'color_taken'}), 409
                user['color'] = new_color
        save_votes()
    broadcast_update()
    return jsonify({'user_id': user_id, **user})

@app.route('/api/me/<user_id>', methods=['DELETE'])
@admin_required
def api_me_delete(user_id):
    """Admin: expulsa a un invitado — borra su usuario y TODOS sus votos.
    Su navegador lo detectará (deja de estar en users_public y el GET da 404)
    y se le forzará a registrarse de nuevo."""
    with votes_lock:
        existed = user_id in votes_state['users']
        votes_state['users'].pop(user_id, None)
        votes_state['votes'].pop(user_id, None)   # nos llevamos sus votos también
        if existed:
            save_votes()
    if not existed:
        return jsonify({'error': 'not_found'}), 404
    broadcast_update()
    return jsonify({'status': 'ok', 'deleted': user_id})

@app.route('/api/vote/<int:wine_idx>', methods=['POST'])
def api_vote(wine_idx):
    """Vota o actualiza el voto de un usuario sobre un vino.

    Body: { user_id, score?: 1-5, comment?: str }
    """
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'missing_user_id'}), 400

    score = data.get('score')
    if score is not None:
        try:
            score = int(score)
        except (TypeError, ValueError):
            return jsonify({'error': 'invalid_score'}), 400
        if score < 1 or score > 5:
            return jsonify({'error': 'score_out_of_range'}), 400

    has_comment = 'comment' in data
    comment = (data.get('comment') or '').strip()[:140] if has_comment else None

    # Validar que el vino existe y ha sido servido
    with state_lock:
        total_wines = len(state['wines'])
        server_idx = state['current_index']
    if wine_idx < 0 or wine_idx >= total_wines:
        return jsonify({'error': 'wine_idx_invalid'}), 400
    if wine_idx > server_idx:
        return jsonify({'error': 'wine_not_served'}), 403

    with votes_lock:
        if user_id not in votes_state['users']:
            return jsonify({'error': 'user_unknown'}), 404
        user_votes = votes_state['votes'].setdefault(user_id, {})
        key = str(wine_idx)
        vote_data = user_votes.get(key, {})
        if score is not None:
            vote_data['score'] = score
        if has_comment:
            if comment:
                vote_data['comment'] = comment
            else:
                vote_data.pop('comment', None)
        if vote_data:
            user_votes[key] = vote_data
        save_votes()

    broadcast_update()
    return jsonify({'status': 'ok'})


@app.route('/api/vote/<int:wine_idx>', methods=['DELETE'])
def api_vote_delete(wine_idx):
    """Elimina el voto del usuario sobre un vino."""
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'missing_user_id'}), 400
    with votes_lock:
        user_votes = votes_state['votes'].get(user_id)
        if user_votes and str(wine_idx) in user_votes:
            del user_votes[str(wine_idx)]
            save_votes()
    broadcast_update()
    return jsonify({'status': 'ok'})


@app.route('/api/votes', methods=['GET'])
def api_votes_summary():
    """Devuelve el agregado de votos por vino + destacados (si corresponde)."""
    summary = votes_summary()
    with state_lock:
        wines = list(state['wines'])
    highlights = calculate_highlights(wines)
    return jsonify({'summary': summary, 'highlights': highlights})


@app.route('/api/votes/clear', methods=['POST'])
@admin_required
def api_votes_clear():
    """Borra todos los votos pero mantiene los usuarios."""
    with votes_lock:
        votes_count = sum(len(uv) for uv in votes_state['votes'].values())
        users_count = len(votes_state['users'])
        votes_state['votes'] = {}
        save_votes()
    broadcast_update()
    return jsonify({
        'status': 'ok',
        'votes_cleared': votes_count,
        'users_kept': users_count,
    })


def _safe_archive_name(name):
    """Sanea un nombre para uso en filename."""
    if not name:
        return ''
    safe = ''.join(c if (c.isalnum() or c in ('-', ' ')) else '_' for c in name)
    safe = safe.strip().replace(' ', '_')
    while '__' in safe:
        safe = safe.replace('__', '_')
    return safe[:60]


@app.route('/api/votes/archive', methods=['POST'])
@admin_required
def api_votes_archive():
    """Archiva la sesión actual (wines + users + votes) y resetea todo."""
    data = request.get_json(silent=True) or {}
    archive_name = _safe_archive_name(data.get('name', ''))

    # Snapshot del estado actual
    with state_lock:
        wines_snapshot = [dict(w) for w in state['wines']]
        session_name = state['session_name']
    with votes_lock:
        users_snapshot = {uid: dict(u) for uid, u in votes_state['users'].items()}
        votes_snapshot = {uid: dict(uv) for uid, uv in votes_state['votes'].items()}

    archive_data = {
        'archived_at': datetime.now().isoformat(timespec='seconds'),
        'session_name': session_name,
        'wines': wines_snapshot,
        'users': users_snapshot,
        'votes': votes_snapshot,
    }

    date_str = datetime.now().strftime('%Y-%m-%d')
    filename = f'{date_str}_{archive_name}.json' if archive_name else f'{date_str}.json'

    archive_dir = os.path.join(DATA_DIR, 'archive')
    os.makedirs(archive_dir, exist_ok=True)
    archive_path = os.path.join(archive_dir, filename)

    # Evitar sobreescribir (si ya existe, añade contador)
    counter = 1
    base, ext = os.path.splitext(filename)
    while os.path.exists(archive_path):
        archive_path = os.path.join(archive_dir, f'{base}_{counter}{ext}')
        counter += 1

    try:
        with open(archive_path, 'w') as f:
            json.dump(archive_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return jsonify({'error': f'archive_failed: {e}'}), 500

    # Reset usuarios y votos (los vinos del wines.json se mantienen)
    with votes_lock:
        votes_state['users'] = {}
        votes_state['votes'] = {}
        save_votes()
    # Volver a la pantalla de bienvenida
    with state_lock:
        state['current_index'] = -1
    save_persisted_state()

    broadcast_update()
    return jsonify({
        'status': 'ok',
        'archived_to': os.path.basename(archive_path),
        'users_archived': len(users_snapshot),
        'votes_archived': sum(len(v) for v in votes_snapshot.values()),
    })


@app.route('/api/votes/wipe', methods=['POST'])
@admin_required
def api_votes_wipe():
    """Borra TODO (usuarios + votos + state) sin archivar — modo pruebas."""
    with votes_lock:
        votes_state['users'] = {}
        votes_state['votes'] = {}
        save_votes()
    with state_lock:
        state['current_index'] = -1
    save_persisted_state()
    broadcast_update()
    return jsonify({'status': 'ok'})


@app.route('/api/welcome', methods=['POST'])
@admin_required
def api_welcome():
    """Vuelve a la pantalla de bienvenida (idx = -1) sin tocar nada más."""
    with state_lock:
        state['current_index'] = -1
    save_persisted_state()
    broadcast_update()
    return jsonify({'status': 'ok'})


@app.route('/stream')
def stream():
    def gen():
        q = queue.Queue(maxsize=8)
        with listeners_lock:
            listeners.append(q)
        try:
            # Estado inicial al conectar
            yield f"data: {json.dumps(current_payload(), ensure_ascii=False)}\n\n"
            while True:
                try:
                    msg = q.get(timeout=20)
                    yield msg
                except queue.Empty:
                    # Heartbeat para que el navegador no cierre la conexión
                    yield ": keepalive\n\n"
        finally:
            with listeners_lock:
                try:
                    listeners.remove(q)
                except ValueError:
                    pass

    return Response(
        gen(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# Init
# ─────────────────────────────────────────────────────────────────────────────
def init():
    session_name, wines, wifi = load_wines()
    with state_lock:
        state['session_name'] = session_name
        state['wines'] = wines
        state['wifi'] = wifi
        state['current_index'] = load_persisted_state()
        if state['current_index'] > len(wines):
            state['current_index'] = 0
    load_votes()
    with votes_lock:
        users_count = len(votes_state['users'])
        votes_count = sum(len(uv) for uv in votes_state['votes'].values())
    print(f"[init] sesión={session_name!r}  vinos={len(wines)}  idx={state['current_index']}")
    print(f"[votes] usuarios={users_count}  votos_totales={votes_count}")


init()


SSL_CERT = '/etc/ssl/cata-vinos/fullchain.pem'
SSL_KEY  = '/etc/ssl/cata-vinos/privkey.pem'


class HTTPSRedirectHandler(BaseHTTPRequestHandler):
    """Redirige cualquier petición HTTP al equivalente HTTPS."""

    def _redirect(self):
        host = self.headers.get('Host', '').split(':')[0]
        self.send_response(301)
        self.send_header('Location', f'https://{host}{self.path}')
        self.send_header('Connection', 'close')
        self.end_headers()

    def do_GET(self):  self._redirect()
    def do_POST(self): self._redirect()
    def do_HEAD(self): self._redirect()

    def log_message(self, fmt, *args):
        # Silenciar logs de cada redirect para no inundar journalctl
        pass


def run_http_redirect():
    try:
        srv = HTTPServer(('0.0.0.0', 80), HTTPSRedirectHandler)
        print('[redirect] HTTP -> HTTPS en :80')
        srv.serve_forever()
    except Exception as e:
        print(f'[redirect] no se pudo arrancar: {e}')


if __name__ == '__main__':
    # Hilo en background para redirigir el 80 al 443
    t = threading.Thread(target=run_http_redirect, daemon=True)
    t.start()

    # Servidor principal HTTPS en 443
    print(f'[main] HTTPS en :443  cert={SSL_CERT}')
    app.run(
        host='0.0.0.0',
        port=443,
        threaded=True,
        debug=False,
        ssl_context=(SSL_CERT, SSL_KEY),
    )
