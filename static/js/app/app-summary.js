// ════════════════════════════════════════════════════════════════════════
// RESUMEN — cards, viaje (journey), destacados y rotación automática (TV)
// ════════════════════════════════════════════════════════════════════════

const SUMMARY_ROTATE_MS = 30000;

let summaryViewTimer = null;
let summaryLocalView = 'cards'; // 'cards' | 'journey'
let summaryViewSince = 0;       // cuándo empezó la vista actual (para la píldora de progreso)

/**
 * Devuelve un array con cuántos vinos van en cada fila del resumen,
 * según el total. Sigue la heurística del usuario:
 *  6→[3,3], 7→[2,3,2], 8→[3,2,3], 9→[3,3,3], 10→[3,4,3]...
 */
function getSummaryLayout(n) {
  const fixed = {
    1: [1], 2: [2], 3: [3],
    4: [2, 2], 5: [2, 3],
    6: [3, 3], 7: [2, 3, 2], 8: [3, 2, 3],
    9: [3, 3, 3], 10: [3, 4, 3], 11: [4, 3, 4],
    12: [4, 4, 4],
  };
  if (fixed[n]) return fixed[n];
  // Fallback: 4 filas lo más uniformes posible para n >= 13
  const rows = 4;
  const base = Math.floor(n / rows);
  let extra = n - base * rows;
  // Empezamos uniformes y vamos sumando 1 a las filas centrales mientras quede
  const out = new Array(rows).fill(base);
  // Reparte el extra empezando por el centro (rows/2) hacia los lados
  const order = [];
  const mid = Math.floor((rows - 1) / 2);
  for (let i = 0; i < rows; i++) {
    order.push(mid + (i % 2 === 0 ? i / 2 : -Math.ceil(i / 2)));
  }
  for (const i of order) {
    if (extra <= 0) break;
    out[i] += 1; extra -= 1;
  }
  return out;
}

function stopSummaryViewTimer() {
  if (summaryViewTimer) {
    clearInterval(summaryViewTimer);
    summaryViewTimer = null;
  }
}

function shouldAutoRotateSummary() {
  // Por defecto automático.
  // Cuando el backend exista, podrá mandar summary_auto=false.
  return !serverState || serverState.summary_auto !== false;
}

function getForcedSummaryView() {
  if (!serverState) return null;

  if (serverState.summary_auto === false) {
    return serverState.summary_view === 'journey' ? 'journey' : 'cards';
  }

  return null;
}

function ensureSummaryViewTimer() {
  if (isMobile()) {
    stopSummaryViewTimer();
    return;
  }

  if (!shouldAutoRotateSummary()) {
    stopSummaryViewTimer();
    return;
  }

  if (summaryViewTimer) return;

  summaryViewSince = Date.now();
  summaryViewTimer = setInterval(() => {
    summaryLocalView = summaryLocalView === 'cards' ? 'journey' : 'cards';
    summaryViewSince = Date.now();
    currentSig = null; // forzar re-render de la vista resumen
    renderCurrent();
  }, SUMMARY_ROTATE_MS);
}

/**
 * Píldoras del resumen en el footer: una por vista (cards y journey).
 * La activa se va llenando durante SUMMARY_ROTATE_MS hasta el cambio de vista.
 * El delay negativo arranca la animación en el punto correcto si la pantalla
 * se re-renderiza a mitad de ciclo (p. ej. al entrar un voto nuevo).
 */
function summaryPillsHtml(activeView) {
  if (isMobile()) {
    return '<div class="dot summary active">☰</div>';
  }

  const auto = shouldAutoRotateSummary();
  const elapsed = (auto && summaryViewSince) ? (Date.now() - summaryViewSince) : 0;

  return ['cards', 'journey'].map(view => {
    const cls = ['dot', 'summary'];
    let style = '';
    if (view === activeView) {
      cls.push('active');
      if (auto) {
        cls.push('filling');
        style = ` style="animation-duration:${SUMMARY_ROTATE_MS}ms;animation-delay:-${elapsed}ms"`;
      }
    }
    return `<div class="${cls.join(' ')}"><div class="fill"${style}></div></div>`;
  }).join('');
}

function getCurrentSummaryView() {
  if (isMobile()) return 'cards';

  const forced = getForcedSummaryView();
  if (forced) return forced;

  return summaryLocalView;
}

function renderSummaryJourney(payload) {
  stopHighlightsRotation();

  const wines = payload.all_wines || [];
  const m = MAPS_DATA && MAPS_DATA.journey_europe;

  const serverIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.total;

  const mobile = isMobile();
  const dotsHtml = [];
  for (let i = 0; i < payload.total; i++) {
    const cls = ['dot', 'done'];
    if (mobile && i <= serverIdx) cls.push('clickable');
    dotsHtml.push(`<div class="${cls.join(' ')}" data-idx="${i}">${mobile ? (i + 1) : ''}</div>`);
  }
  dotsHtml.push(summaryPillsHtml('journey'));

  if (!m) {
    root.innerHTML = `
      <div class="summary-frame journey-frame">
        <div class="corner tl"></div>
        <div class="corner tr"></div>
        <div class="corner bl"></div>
        <div class="corner br"></div>

        <header class="summary-header">
          <div class="session-title">${escapeHtml(payload.session || 'Cata')}</div>
          <div class="summary-title-big">Viaje de la cata</div>
          <div class="counter">${payload.total} vinos</div>
        </header>

        <main class="journey-body">
          <section class="journey-maps-grid journey-map-single">
            <div class="journey-empty">
              Falta el mapa journey_europe en maps_data.json.
            </div>
          </section>
        </main>

        <footer class="tv-footer">
          ${dotsHtml.join('')}
        </footer>
      </div>
    `;
    return;
  }

  const [lonMin, lonMax, latMin, latMax] = m.bbox;
  const [mapW, mapH] = m.size;

  const points = wines
    .map((wine, idx) => {
      if (!wine || !Array.isArray(wine.coords) || wine.coords.length !== 2) {
        return null;
      }

      const [lat, lon] = wine.coords;

      const x = (lon - lonMin) / (lonMax - lonMin) * mapW;
      const y = (latMax - lat) / (latMax - latMin) * mapH;

      // Evitar pintar puntos fuera del mapa si alguna coordenada se sale del bbox.
      if (x < 0 || x > mapW || y < 0 || y > mapH) {
        return null;
      }

      return {
        idx,
        wine,
        x,
        y,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx);

  // Secuencia de animación:
  // punto 1 → tramo 1-2 → punto 2 → tramo 2-3 → punto 3...
  const JOURNEY_POINT_DELAY = 0.3;
  const JOURNEY_SEGMENT_DELAY = 0.9;
  const JOURNEY_STEP = 2;

  // Mantener sincronizado con app.css:
  // .journey-segment.animated {
  //   animation: journey-segment-draw 1.5s ease-out forwards;
  // }
  const JOURNEY_SEGMENT_DURATION = 1.5;

  // -0.05 hace que el punto aparezca un pelín antes de que termine la línea.
  // Si quieres que aparezca justo al final, pon 0.
  // Si quieres que aparezca un poco después, pon 0.05 o 0.1.
  const JOURNEY_POINT_AFTER_SEGMENT = -0.05;

  const pointDelayByWineIdx = new Map();
  points.forEach((p, pointOrderIdx) => {
    const delay = pointOrderIdx === 0
      ? JOURNEY_POINT_DELAY
      : JOURNEY_SEGMENT_DELAY
          + (pointOrderIdx - 1) * JOURNEY_STEP
          + JOURNEY_SEGMENT_DURATION
          + JOURNEY_POINT_AFTER_SEGMENT;

    pointDelayByWineIdx.set(p.idx, delay);
  });


  const segmentsHtml = points.slice(1).map((p, i) => {
    const prev = points[i];
    const delay = JOURNEY_SEGMENT_DELAY + i * JOURNEY_STEP;

    return `
      <line
        class="journey-segment animated"
        x1="${prev.x}"
        y1="${prev.y}"
        x2="${p.x}"
        y2="${p.y}"
        pathLength="1"
        style="--delay: ${delay}s"
      ></line>
    `;
  }).join('');

  const pointsHtml = points.map((p) => {
    const delay = pointDelayByWineIdx.get(p.idx) ?? JOURNEY_POINT_DELAY;

    return `
      <g class="journey-point" transform="translate(${p.x} ${p.y})">
        <g class="journey-point-inner animated" style="--delay: ${delay}s">
          <circle class="journey-point-halo" r="13"></circle>
          <circle class="journey-point-dot" r="5.8"></circle>
          <text class="journey-point-num" x="0" y="0">${p.idx + 1}</text>
        </g>
      </g>
    `;
  }).join('');

  const itineraryHtml = wines.map((wine, idx) => {
    const place = wine.region || wine.do || '—';
    const delay = pointDelayByWineIdx.get(idx) ?? 0.2;

    return `
      <div class="journey-itinerary-item animated" style="--delay: ${delay}s">
        <span class="journey-itinerary-num">${idx + 1}</span>
        <span class="journey-itinerary-name">${escapeHtml(wine.name || '—')}</span>
        <span class="journey-itinerary-place">${escapeHtml(place)}</span>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="summary-frame journey-frame">
      <div class="corner tl"></div>
      <div class="corner tr"></div>
      <div class="corner bl"></div>
      <div class="corner br"></div>

      <header class="summary-header">
        <div class="session-title">${escapeHtml(payload.session || 'Cata')}</div>
        <div class="summary-title-big">Viaje de la cata</div>
        <div class="counter">${payload.total} vinos</div>
      </header>

      <main class="journey-body">
        <section class="journey-maps-grid journey-map-single">
          <section class="journey-map-card journey-map-main">
            <div class="journey-map-title">${escapeHtml(m.label || 'Europa occidental')}</div>

            <svg
              class="journey-map-svg"
              viewBox="0 0 ${mapW} ${mapH}"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <rect class="sea" x="0" y="0" width="${mapW}" height="${mapH}"></rect>
              <path class="country" d="${m.path}"></path>

              ${segmentsHtml}
              ${pointsHtml}
            </svg>
          </section>
        </section>

        <aside class="journey-itinerary">
          <div class="journey-itinerary-title">Orden de cata</div>
          ${itineraryHtml}
        </aside>
      </main>

      <footer class="tv-footer">
        ${dotsHtml.join('')}
      </footer>
    </div>
  `;

  root.querySelectorAll('.tv-footer .dot.clickable').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    if (!isNaN(idx)) el.onclick = () => navigateTo(idx);
  });
}

function renderSummary(payload) {
  const layout = getSummaryLayout(payload.total);
  const wines = payload.all_wines || [];
  const votesSummary = payload.votes_summary || {};
  const highlights = payload.highlights || [];
  const personalFavorites = payload.personal_favorites || {};
  const usersPublic = payload.users_public || {};

  // Detectar el(los) índice(s) favorito(s) para resaltar la tarjeta
  const favoriteIndices = new Set(
    highlights.filter(h => h.type === 'favorite').map(h => h.wine_idx)
  );

  // Detectar favoritos personales (solo móvil, solo si hay identidad)
  // El favorito personal es el/los vino(s) con la puntuación más alta del usuario
  const myFavoriteIndices = new Set();
  let myColorHex = null;
  if (isMobile() && myUser && myUser._votes) {
    let maxScore = 0;
    for (const [idxStr, vote] of Object.entries(myUser._votes)) {
      const s = vote && vote.score;
      if (s && s > maxScore) maxScore = s;
    }
    // Mínimo 4★ — no resaltamos si todo es mediocre
    if (maxScore >= 4) {
      for (const [idxStr, vote] of Object.entries(myUser._votes)) {
        if (vote && vote.score === maxScore) {
          myFavoriteIndices.add(parseInt(idxStr, 10));
        }
      }
      myColorHex = getColorHex(myUser.color);
    }
  }

  let cardIdx = 0;
  const rowsHtml = layout.map(rowCount => {
    const cardsHtml = [];
    for (let i = 0; i < rowCount && cardIdx < wines.length; i++) {
      const thisIdx = cardIdx;
      const w = wines[cardIdx++];
      const photoHtml = w.photo
        ? `<img src="/static/photos/${encodeURIComponent(w.photo)}" alt="" onerror="this.replaceWith(document.getElementById('bottle-fallback').cloneNode(true)); this.parentElement.querySelector('svg').style.display='';">`
        : (document.getElementById('bottle-fallback').outerHTML.replace('display:none', '').replace('id="bottle-fallback"', 'class="placeholder-svg"'));

      const grapeText = w.grape || '';
      const doText = w.do || '';

      let ratingHtml = '';
      const ratingPairs = wineRatingPairs(w);
      if (ratingPairs.length) {
        const inner = ratingPairs.map(p =>
          `<span class="summary-card-rating-pair">${p.sys ? `<span class="summary-card-rating-sys">${escapeHtml(p.sys)}</span>` : ''}<span class="summary-card-rating-sco">${escapeHtml(p.sco)}</span></span>`
        ).join('<span class="summary-card-rating-sep">·</span>');
        ratingHtml = `<div class="summary-card-rating">${inner}</div>`;
      }

      const vintageInline = w.vintage ? `<span class="summary-card-vintage">${escapeHtml(String(w.vintage))}</span>` : '';
      const grapeHtml = grapeText ? `<div class="summary-card-grape">${escapeHtml(grapeText)}</div>` : '';
      const doHtml = doText ? `<div class="summary-card-do">${escapeHtml(doText)}</div>` : '';

      // Puntuaciones: "La mesa" (agregado) + "Mi puntuación" (voto propio, móvil)
      const stars = n => { let s = ''; for (let i = 0; i < 5; i++) s += (i < n ? '★' : '☆'); return s; };
      let scoreRows = '';
      const agg = votesSummary[String(thisIdx)];
      if (agg && agg.count > 0) {
        const plural = agg.count === 1 ? 'voto' : 'votos';
        scoreRows += `<div class="summary-card-score-row">
          <span class="summary-card-score-label">La mesa</span>
          <span class="summary-card-agg-stars">${stars(Math.round(agg.avg))}</span>
          <span class="summary-card-agg-value">${agg.avg.toFixed(1)}</span>
          <span class="summary-card-agg-count">· ${agg.count} ${plural}</span>
        </div>`;
      }
      if (isMobile() && myUser && myUser._votes) {
        const mv = myUser._votes[String(thisIdx)];
        if (mv && typeof mv.score === 'number') {
          scoreRows += `<div class="summary-card-score-row">
            <span class="summary-card-score-label">Mi puntuación</span>
            <span class="summary-card-agg-stars">${stars(mv.score)}</span>
            <span class="summary-card-agg-value">${mv.score}</span>
          </div>`;
        }
      }
      const aggHtml = scoreRows ? `<div class="summary-card-agg">${scoreRows}</div>` : '';

      // Fans: usuarios que tienen este vino como su favorito personal
      const fans = personalFavorites[String(thisIdx)] || [];
      let fansHtml = '';
      if (fans.length > 0) {
        let pillsHtml;
        if (fans.length <= 2) {
          // Pocos: mostrar dot + nombre
          pillsHtml = fans.map(uid => {
            const u = usersPublic[uid] || {};
            const hex = getColorHex(u.color);
            const name = escapeHtml(u.name || '—');
            return `<span class="summary-card-fan"><span class="summary-card-fan-dot" style="background:${hex}"></span>${name}</span>`;
          }).join('');
        } else {
          // Muchos: solo dots agrupados + contador entre paréntesis
          const dots = fans.map(uid => {
            const u = usersPublic[uid] || {};
            const hex = getColorHex(u.color);
            const name = escapeHtml(u.name || '—');
            return `<span class="summary-card-fan-dot" style="background:${hex}" title="${name}"></span>`;
          }).join('');
          pillsHtml = `<span class="summary-card-fans-cluster">${dots}</span><span class="summary-card-fans-count">(${fans.length})</span>`;
        }
        fansHtml = `<div class="summary-card-fans"><span class="summary-card-fans-label">Favorito de:</span>${pillsHtml}</div>`;
      }

      const isFavorite = favoriteIndices.has(thisIdx);
      const isMyFavorite = myFavoriteIndices.has(thisIdx);
      const classes = ['summary-card'];
      if (isFavorite) classes.push('is-favorite');
      if (isMyFavorite) classes.push('is-my-favorite');

      const badgeHtml = isFavorite ? '<div class="summary-card-badge">★ Favorito de la mesa</div>' : '';
      const myBadgeHtml = isMyFavorite && myColorHex
        ? `<div class="summary-card-mybadge" style="background:${myColorHex}">★ Mi favorito</div>`
        : '';

      // Cards clickables en móvil: tocar el card lleva a la vista de ese vino
      const mobileNav = isMobile();
      const clickableClass = mobileNav ? ' clickable' : '';
      const clickAttr = mobileNav ? ` data-nav-idx="${thisIdx}"` : '';
      // Estilo inline para el borde lateral coloreado si es favorito personal
      const styleAttr = isMyFavorite && myColorHex
        ? ` style="border-left-color: ${myColorHex}"`
        : '';

      cardsHtml.push(`
        <div class="${classes.join(' ')}${clickableClass}"${clickAttr}${styleAttr}>
          <div class="summary-card-photo">${photoHtml}</div>
          <div class="summary-card-info">
            ${badgeHtml}
            ${myBadgeHtml}
            <div class="summary-card-name-row">
              <span class="summary-card-name">${escapeHtml(w.name || '—')}</span>
              ${vintageInline}
            </div>
            <div class="summary-card-winery">${escapeHtml(w.winery || '—')}</div>
            ${grapeHtml}
            ${doHtml}
            ${ratingHtml}
            ${aggHtml}
            ${fansHtml}
          </div>
        </div>
      `);
    }
    return `<div class="summary-row">${cardsHtml.join('')}</div>`;
  }).join('');

  // Dots: todos hechos + uno especial del resumen activo
  const serverIdx = (typeof payload._serverIdx === 'number') ? payload._serverIdx : payload.total;
  const mobile = isMobile();
  const dotsHtml = [];
  for (let i = 0; i < payload.total; i++) {
    const cls = ['dot', 'done'];
    if (mobile && i <= serverIdx) cls.push('clickable');
    dotsHtml.push(`<div class="${cls.join(' ')}" data-idx="${i}">${mobile ? (i + 1) : ''}</div>`);
  }
  dotsHtml.push(summaryPillsHtml('cards'));

  root.innerHTML = `
    <div class="summary-frame" data-rows="${layout.length}">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
      <div class="summary-header">
        <div class="session-title">${escapeHtml(payload.session || 'Cata')}</div>
        <div class="summary-title-big">Resumen</div>
        <div class="counter">${payload.total} vinos</div>
      </div>
      <div id="highlights-overlay" class="highlights-overlay empty"></div>
      <div class="summary-rows">${rowsHtml}</div>
      <div class="tv-footer">${dotsHtml.join('')}</div>
    </div>`;

  // Conectar dots clicables (solo móvil)
  root.querySelectorAll('.tv-footer .dot.clickable').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    if (!isNaN(idx)) el.onclick = () => navigateTo(idx);
  });

  // Conectar cards clickables (solo móvil: tap lleva al vino)
  root.querySelectorAll('.summary-card.clickable').forEach(el => {
    const idx = parseInt(el.dataset.navIdx, 10);
    if (!isNaN(idx)) el.onclick = () => navigateTo(idx);
  });

  // Iniciar rotación de destacados
  startHighlightsRotation(highlights);
}

// ── Rotación de destacados ──
let highlightsRotationTimer = null;
let highlightsCurrentIdx = 0;

function stopHighlightsRotation() {
  if (highlightsRotationTimer) {
    clearTimeout(highlightsRotationTimer);
    highlightsRotationTimer = null;
  }
}

function startHighlightsRotation(highlights) {
  stopHighlightsRotation();
  const el = document.getElementById('highlights-overlay');
  if (!el) return;
  if (!highlights || highlights.length === 0) {
    el.classList.add('empty');
    return;
  }
  el.classList.remove('empty');
  highlightsCurrentIdx = 0;
  renderHighlight(el, highlights, 0);
  if (highlights.length > 1) {
    scheduleNextHighlight(el, highlights);
  }
}

function scheduleNextHighlight(el, highlights) {
  highlightsRotationTimer = setTimeout(() => {
    // Fade out
    el.classList.add('fading');
    setTimeout(() => {
      highlightsCurrentIdx = (highlightsCurrentIdx + 1) % highlights.length;
      renderHighlight(el, highlights, highlightsCurrentIdx);
      el.classList.remove('fading');
      scheduleNextHighlight(el, highlights);
    }, 400);
  }, 6000);
}

function getColorHexFromKey(key) {
  // Buscar en la cache de colores cargada por fetchColors
  if (typeof onboardingColors !== 'undefined' && onboardingColors.length) {
    const found = onboardingColors.find(c => c.key === key);
    if (found) return found.hex;
  }
  return '#d8c094';
}

function renderHighlight(el, highlights, idx) {
  const h = highlights[idx];
  if (!h) { el.innerHTML = ''; return; }

  // Indicadores de rotación (solo si hay >1 destacado)
  const dotsHtml = highlights.length > 1
    ? highlights.map((_, i) =>
        `<div class="highlights-dot${i === idx ? ' active' : ''}"></div>`
      ).join('')
    : '';

  let iconChar = '✦';
  let bodyHtml = '';

  if (h.type === 'favorite') {
    iconChar = '🏆';
    const filled = Math.round(h.avg || 0);
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += (i < filled ? '★' : '☆');
    const plural = h.count === 1 ? 'voto' : 'votos';
    bodyHtml = `
      <div class="highlights-title">${escapeHtml(h.wine_name || '')}</div>
      <div class="highlights-meta">
        <span class="highlights-stars">${starStr}</span>
        <span class="highlights-avg">${(h.avg || 0).toFixed(1)}</span>
        <span class="highlights-extra">· ${h.count} ${plural} · ${escapeHtml(h.winery || '')}</span>
      </div>`;
  } else if (h.type === 'polarizing') {
    iconChar = '⚡';
    bodyHtml = `
      <div class="highlights-title">${escapeHtml(h.wine_name || '')}</div>
      <div class="highlights-meta">
        <span class="highlights-extra">De ${h.min_score}★ a ${h.max_score}★ · sin consenso</span>
      </div>`;
  } else if (h.type === 'unanimous') {
    iconChar = '🤝';
    const filled = Math.round(h.avg || 0);
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += (i < filled ? '★' : '☆');
    bodyHtml = `
      <div class="highlights-title">${escapeHtml(h.wine_name || '')}</div>
      <div class="highlights-meta">
        <span class="highlights-stars">${starStr}</span>
        <span class="highlights-avg">${(h.avg || 0).toFixed(1)}</span>
        <span class="highlights-extra">· todos de acuerdo</span>
      </div>`;
  } else if (h.type === 'comment') {
    iconChar = '💬';
    const colorHex = getColorHexFromKey(h.user_color);
    bodyHtml = `
      <div class="highlights-quote">${escapeHtml(h.comment || '')}</div>
      <div class="highlights-attrib">
        <span class="highlights-attrib-dot" style="background:${colorHex}"></span>
        <span><strong>${escapeHtml(h.user_name || '—')}</strong> sobre ${escapeHtml(h.wine_name || '')}</span>
      </div>`;
  }

  el.innerHTML = `
    <div class="highlights-dots">${dotsHtml}</div>
    <div class="highlights-eyebrow">
      <span class="highlights-icon">${iconChar}</span>
      <span>${escapeHtml(h.label || '')}</span>
    </div>
    ${bodyHtml}`;
}
