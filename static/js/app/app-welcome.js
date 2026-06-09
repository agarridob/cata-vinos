// ════════════════════════════════════════════════════════════════════════
// VISTA BIENVENIDA — QRs (TV) y bloque de registro (móvil)
// ════════════════════════════════════════════════════════════════════════

// Desglose de la carta por tipo de vino, p.ej. ", 1 espumoso, 3 blancos y 3 tintos".
// Orden de cata (de ligero a potente). Devuelve '' si ningún vino tiene tipo.
function winesTypeBreakdownHtml(wines) {
  if (!Array.isArray(wines)) return '';
  const labels = {
    espumoso: ['espumoso', 'espumosos'],
    blanco:   ['blanco', 'blancos'],
    rosado:   ['rosado', 'rosados'],
    orange:   ['orange', 'orange'],
    tinto:    ['tinto', 'tintos'],
  };
  const order = ['espumoso', 'blanco', 'rosado', 'orange', 'tinto'];
  const counts = {};
  wines.forEach(w => {
    const t = w && w.type;
    if (labels[t]) counts[t] = (counts[t] || 0) + 1;
  });
  const parts = order
    .filter(t => counts[t])
    .map(t => `${counts[t]} ${labels[t][counts[t] === 1 ? 0 : 1]}`);
  if (!parts.length) return '';
  const text = parts.length === 1
    ? parts[0]
    : parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1];
  return `<span class="welcome-host-breakdown"> · ${text}</span>`;
}

function renderWelcome(payload) {
  const mobile = isMobile();
  // Configuración WiFi (desde wines.json). Si no existe o show=false, no se muestra el QR del WiFi.
  const wifi = payload.wifi_config || null;
  const showWifi = !!(wifi && wifi.show && wifi.ssid);
  // Generar QRs (solo necesario en TV)
  let qrCataHtml = '';
  let qrWifiHtml = '';
  if (!mobile) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(window.location.origin + '/');
      qr.make();
      qrCataHtml = qr.createSvgTag({ scalable: true, margin: 2 });
    } catch (e) {
      qrCataHtml = '';
    }
    if (showWifi) {
      try {
        // Formato estándar de QR para WiFi: WIFI:T:WPA;S:<ssid>;P:<password>;;
        const ssid = String(wifi.ssid).replace(/([\\;,:"])/g, '\\$1');
        const pass = String(wifi.password || '').replace(/([\\;,:"])/g, '\\$1');
        const auth = wifi.password ? 'WPA' : 'nopass';
        const qrw = qrcode(0, 'M');
        qrw.addData(`WIFI:T:${auth};S:${ssid};P:${pass};;`);
        qrw.make();
        qrWifiHtml = qrw.createSvgTag({ scalable: true, margin: 2 });
      } catch (e) {
        qrWifiHtml = '';
      }
    }
  }

  // Lista de invitados ya registrados
  const usersPublic = payload.users_public || {};
  const userEntries = Object.entries(usersPublic);
  let guestsHtml = '';
  const myUid = myUser ? myUser.user_id : null;
  if (userEntries.length === 0) {
    guestsHtml = `
      <div class="welcome-guests">
        <div class="welcome-guests-title">Invitados a la mesa</div>
        <div class="welcome-guests-empty">Esperando a los primeros invitados…</div>
      </div>`;
  } else {
    const guestPills = userEntries.map(([uid, u]) => {
      const hex = getColorHex(u.color);
      const isMe = (uid === myUid) ? ' is-me' : '';
      const name = escapeHtml(u.name || '—');
      return `
        <div class="welcome-guest${isMe}">
          <span class="welcome-guest-dot" style="background:${hex}"></span>
          <span class="welcome-guest-name">${name}</span>
        </div>`;
    }).join('');
    const countLabel = userEntries.length === 1 ? '1 invitado' : `${userEntries.length} invitados`;
    guestsHtml = `
      <div class="welcome-guests">
        <div class="welcome-guests-title">${countLabel} en la mesa</div>
        <div class="welcome-guests-list">${guestPills}</div>
      </div>`;
  }

  // En móvil mostramos también el estado del invitado (identidad/no)
  let mobileBlockHtml = '';
  if (mobile) {
    if (myUser && myUser.user_id) {
      const hex = getColorHex(myUser.color);
      mobileBlockHtml = `
        <div class="welcome-status">
          <span class="name-dot" style="background:${hex}"></span>
          <strong>${escapeHtml(myUser.name || '—')}</strong>, ya estás registrado.<br>
          Espera a que el anfitrión empiece la cata.
        </div>
        <div class="welcome-actions">
          <button class="welcome-btn welcome-btn-edit" id="welcome-edit-btn">Editar mi perfil</button>
        </div>`;
    } else {
      mobileBlockHtml = `
        <div class="welcome-status">
          Toca el botón para registrarte.<br>
          Cuando empiece la cata, podrás votar.
        </div>
        <div class="welcome-actions">
          <button class="welcome-btn" id="welcome-register-btn">Registrarme</button>
        </div>`;
    }
  }

  // Bloques QR (solo TV): WiFi a la izquierda (si está configurado), Cata a la derecha
  const wifiCredsHtml = (showWifi) ? `
          <div class="welcome-qr-credentials">
            <div class="welcome-qr-cred-row">
              <span class="welcome-qr-cred-label">Red</span>
              <span class="welcome-qr-cred-value">${escapeHtml(wifi.ssid)}</span>
            </div>
            ${wifi.password ? `
            <div class="welcome-qr-cred-row">
              <span class="welcome-qr-cred-label">Pass</span>
              <span class="welcome-qr-cred-value">${escapeHtml(wifi.password)}</span>
            </div>` : ''}
          </div>` : '';
  const qrRowHtml = !mobile && (qrWifiHtml || qrCataHtml) ? `
    <div class="welcome-qr-row">
      ${qrWifiHtml ? `
        <div class="welcome-qr-block">
          <div class="welcome-qr-title">Conéctate al WiFi primero</div>
          <div class="welcome-qr">${qrWifiHtml}</div>
          ${wifiCredsHtml}
        </div>` : ''}
      ${qrCataHtml ? `
        <div class="welcome-qr-block">
          <div class="welcome-qr-title">Entra a la cata</div>
          <div class="welcome-qr">${qrCataHtml}</div>
        </div>` : ''}
    </div>` : '';

  root.innerHTML = `
    <div class="welcome-frame">
      <div class="welcome-eyebrow">Bienvenidos a la cata</div>
      <div class="welcome-title">In Vino Veritas</div>
      <div class="welcome-session">${escapeHtml(payload.session || 'Cata')}</div>
      ${qrRowHtml}
      ${!mobile ? '<div class="welcome-cta">Escanea con tu móvil para unirte</div>' : ''}
      ${mobileBlockHtml}
      ${guestsHtml}
      <div class="welcome-host-info">${payload.total} ${payload.total === 1 ? 'vino' : 'vinos'} en cata${winesTypeBreakdownHtml(payload.all_wines)}</div>
    </div>`;

  // En móvil, si NO hay identidad, abrir el modal directamente (a los 600ms para que se vea la bienvenida primero)
  if (mobile && !myUser) {
    setTimeout(() => {
      if (!myUser) showOnboarding('first');
    }, 600);
    // Botón de registro manual
    const btn = document.getElementById('welcome-register-btn');
    if (btn) btn.onclick = () => showOnboarding('first');
  }
  // Botón de editar perfil (usuario ya registrado en welcome)
  if (mobile && myUser) {
    const editBtn = document.getElementById('welcome-edit-btn');
    if (editBtn) editBtn.onclick = () => showOnboarding('edit');
  }
}
