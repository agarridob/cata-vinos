// ════════════════════════════════════════════════════════════════════════
// POPUPS DE VOTOS — notificaciones flotantes (solo TV)
// ════════════════════════════════════════════════════════════════════════

// ─── Sistema de popups de votos (solo TV) ─────────────────────────────
let lastVotesByUser = {};
let lastVotesForWineIdx = null;
const POPUP_DURATION_MS = 5000;
const POPUP_FADEOUT_MS = 400;
const MAX_POPUPS = 5;

function detectVoteChanges(wineIdx, currentVotes, usersPublic) {
  // Si cambió el vino, no mostrar popups: solo cachear el estado actual
  if (lastVotesForWineIdx !== wineIdx) {
    lastVotesByUser = JSON.parse(JSON.stringify(currentVotes));
    lastVotesForWineIdx = wineIdx;
    return;
  }

  // Detectar cambios usuario por usuario
  for (const [uid, vote] of Object.entries(currentVotes)) {
    const prev = lastVotesByUser[uid] || {};
    const user = usersPublic[uid] || {};
    if (!user.name) continue;

    // Score: nuevo o cambiado
    const prevScore = prev.score;
    const newScore = vote.score;
    if (newScore && newScore !== prevScore) {
      showVotePopup(user, newScore, prevScore != null);
    } else if (!newScore && prevScore) {
      showRetractPopup(user);
    }

    // Comentario: nuevo o cambiado (ignorar vacíos)
    const prevComment = (prev.comment || '').trim();
    const newComment = (vote.comment || '').trim();
    if (newComment && newComment !== prevComment) {
      showCommentPopup(user, newComment);
    }
  }

  lastVotesByUser = JSON.parse(JSON.stringify(currentVotes));
}

function showVotePopup(user, score, isUpdate) {
  // Texto contextual según puntuación
  const actions = {
    5: isUpdate ? 'ahora dice ¡cinco estrellas!' : 'se ha enamorado',
    4: isUpdate ? 'lo ha subido a' : 'le ha gustado',
    3: isUpdate ? 'ahora le da' : 'lo ha votado',
    2: isUpdate ? 'lo ha bajado a' : 'no le ha convencido',
    1: isUpdate ? 'ha rebajado a' : 'lo ha sufrido',
  };
  const stars = '★'.repeat(score) + '☆'.repeat(5 - score);
  appendPopup({
    user: user,
    action: actions[score] || 'ha votado',
    extra: `<span class="vote-popup-stars">${stars}</span>`,
    typeClass: `score-${score}`,
  });
}

function showRetractPopup(user) {
  appendPopup({
    user: user,
    action: 'ha retirado su voto',
    extra: '',
    typeClass: 'comment',
  });
}

function showCommentPopup(user, comment) {
  const truncated = comment.length > 80 ? comment.slice(0, 80) + '…' : comment;
  appendPopup({
    user: user,
    action: 'ha comentado',
    extra: `<div class="vote-popup-comment">«${escapeHtml(truncated)}»</div>`,
    typeClass: 'comment',
    extended: true,
  });
}

function appendPopup({ user, action, extra, typeClass, extended }) {
  let container = document.getElementById('vote-popup-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'vote-popup-container';
    document.body.appendChild(container);
  }
  // Limitar número de popups simultáneos: eliminar el más antiguo
  while (container.children.length >= MAX_POPUPS) {
    container.firstChild.remove();
  }

  const hex = getColorHex(user.color);
  const popup = document.createElement('div');
  popup.className = `vote-popup ${typeClass}`;
  popup.innerHTML = `
    <span class="vote-popup-dot" style="background:${hex}"></span>
    <div class="vote-popup-body">
      <span class="vote-popup-name">${escapeHtml(user.name)}</span>
      <span class="vote-popup-action">${action}</span>
    </div>
    ${extra}
  `;
  container.appendChild(popup);

  // Animar entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => popup.classList.add('show'));
  });

  // Salida automática
  setTimeout(() => {
    popup.classList.remove('show');
    popup.classList.add('hide');
    setTimeout(() => popup.remove(), POPUP_FADEOUT_MS);
  }, POPUP_DURATION_MS);
}
// ───────────────────────────────────────────────────────────────────────
