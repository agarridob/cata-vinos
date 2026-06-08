# 🍷 Cata de Vinos — In Vino Veritas

Webapp en **Flask** para organizar una cata de vinos con pantalla principal tipo TV, panel de control para el anfitrión, edición visual de la carta, gestión de invitados y sistema de votación en tiempo real.

La app está pensada para una dinámica de cata compartida:

- La pantalla grande muestra el vino actual, ficha, foto, mapa de origen y votos agregados.
- El anfitrión controla la cata desde `/control`.
- El panel está protegido con autenticación.
- El panel está organizado en pestañas: **Cata**, **Invitados**, **Carta** y **Admin**.
- Los invitados entran desde el móvil escaneando un QR.
- Cada invitado puede identificarse con nombre y color, votar vinos y dejar comentarios.
- La pantalla se actualiza en directo mediante **Server-Sent Events**.
- La carta de vinos puede editarse visualmente desde el panel de control.
- La configuración WiFi puede gestionarse desde la pestaña **Admin**.

---

## 🚀 Desarrollo rápido

```bash
make
```

---

## ✨ Funcionalidades

### Pantalla TV (`/`)

Muestra:

- Nombre de la sesión  
- Pantalla de bienvenida con QR  
- Información completa del vino  
- Foto de botella  
- Mapa de origen  
- Progreso de la cata  
- Votaciones en tiempo real  
- Resumen final  

---

## 🎛️ Panel de control (`/control`)

Organizado en pestañas:

```text
Cata | Invitados | Carta | Admin
```

---

### 🍷 Cata

Uso principal durante la sesión:

- Avanzar / retroceder vinos  
- Ir a un vino concreto  
- Ir al resumen  
- Recargar vinos  
- Volver a bienvenida (sin perder invitados ni votos)  

---

### 👥 Invitados

- Ver invitados en tiempo real  
- Ver color y nombre  
- Expulsar invitado (borra votos asociados)  

---

### 📖 Carta

Editor visual de vinos:

- Cargar carta  
- Editar campos  
- Añadir / duplicar / eliminar vinos  
- Reordenar vinos  
- Guardar cambios en `wines.json`  

---

### ⚙️ Admin

Configuración avanzada:

- Configuración WiFi (QR en bienvenida)  
- Limpiar votos  
- Archivar sesión  
- Reset completo  

---

## 🔐 Autenticación

Variables necesarias:

```env
SECRET_KEY=...
ADMIN_PASSWORD=...
```

---

## 📱 Flujo de la cata

1. Configurar vinos  
2. Arrancar app  
3. Abrir `/` en TV  
4. Abrir `/control`  
5. Invitados escanean QR  
6. Votan desde móvil  

---

## 🛠️ Desarrollo

El proyecto incluye un `Makefile`:

```bash
make
```

---

## 🗺️ Roadmap

- Exportar resultados (CSV/JSON)  
- Historial de sesiones  
- Mejoras en mapas  
- Más regiones  
- Capturas en README  
- Tests básicos  

---

## Licencia

GNU GPL v3

---

## Autor

https://github.com/agarridob
