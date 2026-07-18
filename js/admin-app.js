// ============================================================
// HANGAR WORLD — CAMPEONATO FC26
// js/admin-app.js — Controle do Painel Administrativo (SPA)
// ============================================================

let admState = {
  players: [],
  groupMatches: [],
  knockoutMatches: [],
  settings: null,
  waitlist: []
};

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H'];

// Helpers de escape de HTML e nomes
function esc(str) {
  if(!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function admName(id) {
  const p = admState.players.find(x => x.id === id);
  return p ? p.name : `[Desconhecido:${id ? id.substring(0,4)}..]`;
}

// ------------------------------------------------------------
// CONTROLE DE ABAS
// ------------------------------------------------------------
let activeTab = 'players'; // 'players'|'schedule'|'matches'|'groups'|'knockout'|'settings'
function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.adm-nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tab);
  });
  renderActiveTab();
}

// ------------------------------------------------------------
// LOGICA DE TORNEIO REPLICADA NO FRONTEND (IGUAL AO TOURNAMENT.JS)
// ------------------------------------------------------------
function computeStandings(groupLetter, players, matches) {
  const ids = players.filter(p => p.group_letter === groupLetter).map(p => p.id);
  const table = {};
  ids.forEach(id => {
    table[id] = { id, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, played: 0 };
  });

  matches.filter(m => m.group_letter === groupLetter && m.status === 'done').forEach(m => {
    const t1 = table[m.p1], t2 = table[m.p2];
    if (!t1 || !t2) return;
    t1.gf += m.score1; t1.ga += m.score2; t2.gf += m.score2; t2.ga += m.score1;
    t1.played++; t2.played++;
    if (m.score1 > m.score2) { t1.w++; t1.pts += 3; t2.l++; }
    else if (m.score1 < m.score2) { t2.w++; t2.pts += 3; t1.l++; }
    else { t1.d++; t2.d++; t1.pts += 1; t2.pts += 1; }
  });
  Object.values(table).forEach(t => t.gd = t.gf - t.ga);

  function h2h(id1, id2) {
    const m = matches.find(mm => mm.group_letter === groupLetter && mm.status === 'done' &&
      ((mm.p1 === id1 && mm.p2 === id2) || (mm.p1 === id2 && mm.p2 === id1)));
    if (!m) return 0;
    return m.p1 === id1 ? m.score1 - m.score2 : m.score2 - m.score1;
  }

  return Object.values(table).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const h = h2h(a.id, b.id);
    if (h !== 0) return -h;
    return 0;
  });
}

function groupComplete(letter, groupMatches) {
  const matches = groupMatches.filter(m => m.group_letter === letter);
  // CORRIGIDO: Agora valida com 3 jogos por grupo
  return matches.length >= 3 && matches.every(m => m.status === 'done');
}

function allGroupsComplete(matches) {
  return GROUP_LETTERS.every(letter => {
    const gm = matches.filter(m => m.group_letter === letter);
    // CORRIGIDO: Retorna verdadeiro se o grupo tiver seus 3 jogos concluídos
    return gm.length >= 3 && gm.every(m => m.status === 'done');
  });
}

// ------------------------------------------------------------
// RENDERIZADORES DE TELAS
// ------------------------------------------------------------
function renderActiveTab() {
  const container = document.getElementById('adm-main-content');
  if (!container) return;

  if (activeTab === 'players') container.innerHTML = renderAdmPlayers();
  else if (activeTab === 'schedule') container.innerHTML = renderAdmSchedule();
  else if (activeTab === 'matches') container.innerHTML = renderAdmMatches();
  else if (activeTab === 'groups') container.innerHTML = renderAdmGroups();
  else if (activeTab === 'knockout') container.innerHTML = renderAdmKnockout();
  else if (activeTab === 'settings') container.innerHTML = renderAdmSettings();
}

function renderAdmPlayers() {
  const list = admState.players.map(p => `
    <div class="player-row">
      <span><strong>${esc(p.name)}</strong> ${p.group_letter ? `<span class="badge">Grupo ${p.group_letter}</span>` : ''}</span>
      ${!admState.settings?.groups_drawn ? `<button class="btn btn--danger btn--sm" data-adm-action="removePlayer" data-id="${p.id}">Remover</button>` : `<button class="btn btn--secondary btn--sm" data-adm-action="openSubstituteModal" data-id="${p.id}">Substituir</button>`}
    </div>
  `).join('');

  const wait = admState.waitlist.map(w => `
    <div class="player-row">
      <span style="opacity:0.7">${esc(w.name)} ${w.used ? `<span class="badge badge--success">Entrou</span>` : ''}</span>
    </div>
  `).join('');

  return `
    <div class="adm-section-head">
      <div><h2>Jogadores Inscritos (${admState.players.length}/24)</h2><p>Gerencie os participantes antes ou durante o torneio.</p></div>
      ${!admState.settings?.groups_drawn ? `<div class="adm-section-actions"><button class="btn btn--live" data-adm-action="drawGroups">Sortear Grupos (24 Jogadores)</button></div>` : ''}
    </div>
    <div class="two-col-grid">
      <div class="panel">
        <h3>Titulares Ativos</h3>
        <div class="form-group inline-form" style="margin-top:1rem;">
          <input type="text" id="new-player-name" placeholder="Nome do jogador...">
          <button class="btn" data-adm-action="addPlayer">Adicionar</button>
        </div>
        <div class="player-list">${list || '<p class="empty-text">Nenhum jogador cadastrado.</p>'}</div>
      </div>
      <div class="panel">
        <h3>Lista de Espera / Suplentes</h3>
        <div class="form-group inline-form" style="margin-top:1rem;">
          <input type="text" id="new-wait-name" placeholder="Nome do suplente...">
          <button class="btn btn--secondary" data-adm-action="addWaitlist">Adicionar à Espera</button>
        </div>
        <div class="player-list">${wait || '<p class="empty-text">Ninguém na lista de espera.</p>'}</div>
      </div>
    </div>
  `;
}

function renderAdmSchedule() {
  if (!admState.settings?.tournament_started) {
    return `
      <div class="adm-section-head"><h2>Cronograma Geral</h2></div>
      <div class="empty-state">
        <h3>Campeonato não iniciado</h3>
        <p>Após realizar o sorteio dos grupos, clique abaixo para dar a largada oficial e calcular os horários estimados de cada jogo.</p>
        <button class="btn btn--live" style="margin-top:1rem;" data-adm-action="startTournament">Iniciar Campeonato Oficial</button>
      </div>`;
  }
  
  const all = [...admState.groupMatches.map(m=>({...m,phase:'group'})), ...admState.knockoutMatches.map(m=>({...m,phase:m.round}))];
  all.sort((a,b) => (a.order_index??0) - (b.order_index??0));

  const rows = all.map(m => {
    const timeStr = m.scheduled_time ? new Date(m.scheduled_time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
    let label = m.phase === 'group' ? `Grupo ${m.group_letter}` : m.phase.toUpperCase();
    let statusClass = m.status === 'live' ? 'status-live' : (m.status==='done'?'status-done':'status-waiting');
    let statusTxt = m.status === 'live' ? 'AO VIVO' : (m.status==='done'?'ENCERRADO':'AGUARDANDO');
    return `
      <tr>
        <td><strong>${timeStr}</strong></td>
        <td><span class="badge">${label}</span></td>
        <td>Estação ${m.station || '?'}</td>
        <td>${esc(admName(m.p1))} vs ${esc(admName(m.p2))}</td>
        <td><span class="status-indicator ${statusClass}">${statusTxt}</span></td>
      </tr>`;
  }).join('');

  return `
    <div class="adm-section-head"><h2>Cronograma Geral</h2><p>Ordem cronológica estimada das partidas em todas as estações.</p></div>
    <div class="panel">
      <table class="standings">
        <thead><tr><th>Horário</th><th>Fase</th><th>Estação</th><th>Confronto</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Nenhuma partida gerada.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function renderAdmMatches() {
  const live = [...admState.groupMatches.filter(m=>m.status==='live').map(m=>({...m,src:'group'})), ...admState.knockoutMatches.filter(m=>m.status==='live').map(m=>({...m,src:'ko'}))];
  const waiting = [...admState.groupMatches.filter(m=>m.status==='waiting').map(m=>({...m,src:'group'})), ...admState.knockoutMatches.filter(m=>m.status==='waiting').map(m=>({...m,src:'ko'}))].sort((a,b)=>(a.order_index??0)-(b.order_index??0));
  const done = [...admState.groupMatches.filter(m=>m.status==='done').map(m=>({...m,src:'group'})), ...admState.knockoutMatches.filter(m=>m.status==='done').map(m=>({...m,src:'ko'}))].sort((a,b)=>(b.order_index??0)-(a.order_index??0));

  return `
    <div class="adm-section-head"><h2>Controle de Partidas Placar ao Vivo</h2></div>
    <div class="matches-control-grid">
      <div class="panel">
        <h3>Em Andamento (Ao Vivo nas Estações)</h3>
        <div class="matches-list-admin">${live.map(renderMatchCardAdminLive).join('') || '<p class="empty-text">Nenhuma partida rolando agora.</p>'}</div>
      </div>
      <div class="panel">
        <h3>Próximas Partidas (Fila de Espera)</h3>
        <div class="matches-list-admin">${waiting.map(renderMatchCardAdminWaiting).join('') || '<p class="empty-text">Fila vazia.</p>'}</div>
      </div>
      <div class="panel">
        <h3>Histórico de Jogos Concluídos</h3>
        <div class="matches-list-admin">${done.map(renderMatchCardAdminDone).join('') || '<p class="empty-text">Nenhum jogo encerrado ainda.</p>'}</div>
      </div>
    </div>`;
}

function renderMatchCardAdminLive(m) {
  let label = m.src === 'group' ? `Grupo ${m.group_letter}` : m.round.toUpperCase();
  return `
    <div class="match-card-adm match-card-adm--live">
      <div class="card-top"><span>${label} · <strong>Estação ${m.station||'?'}</strong></span> <span class="pulse-dot"></span></div>
      <div class="scoreboard-adm">
        <div class="side">
          <span class="pname">${esc(admName(m.p1))}</span>
          <div class="score-actions">
            <button class="btn btn--sm" data-adm-action="score" data-id="${m.id}" data-src="${m.src}" data-side="1" data-delta="-1">-</button>
            <span class="score-val" id="score-val-${m.id}-1">${m.score1}</span>
            <button class="btn btn--sm" data-adm-action="score" data-id="${m.id}" data-src="${m.src}" data-side="1" data-delta="1">+</button>
          </div>
        </div>
        <div class="vs-divider">X</div>
        <div class="side">
          <span class="pname">${esc(admName(m.p2))}</span>
          <div class="score-actions">
            <button class="btn btn--sm" data-adm-action="score" data-id="${m.id}" data-src="${m.src}" data-side="2" data-delta="-1">-</button>
            <span class="score-val" id="score-val-${m.id}-2">${m.score2}</span>
            <button class="btn btn--sm" data-adm-action="score" data-id="${m.id}" data-src="${m.src}" data-side="2" data-delta="1">+</button>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn--live btn--sm" data-adm-action="finish" data-id="${m.id}" data-src="${m.src}">Salvar e Encerrar</button>
      </div>
    </div>`;
}

function renderMatchCardAdminWaiting(m) {
  let label = m.src === 'group' ? `Grupo ${m.group_letter}` : m.round.toUpperCase();
  const timeStr = m.scheduled_time ? new Date(m.scheduled_time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
  return `
    <div class="match-card-adm">
      <div class="card-top"><span>${label} · Estação ${m.station||'?'} · <strong>${timeStr}</strong></span></div>
      <div class="versus-text-adm"><strong>${esc(admName(m.p1))}</strong> <span>vs</span> <strong>${esc(admName(m.p2))}</strong></div>
      <div class="card-actions">
        <button class="btn btn--sm" data-adm-action="start" data-id="${m.id}" data-src="${m.src}">Chamar para Estação (Iniciar)</button>
        <button class="btn btn--secondary btn--sm" data-adm-action="openWoModal" data-id="${m.id}" data-src="${m.src}">Aplicar W.O.</button>
      </div>
    </div>`;
}

function renderMatchCardAdminDone(m) {
  let label = m.src === 'group' ? `Grupo ${m.group_letter}` : m.round.toUpperCase();
  return `
    <div class="match-card-adm match-card-adm--done">
      <div class="card-top"><span>${label} ${m.wo ? '· <strong style="color:var(--live-color)">VITÓRIA POR W.O.</strong>' : ''}</span></div>
      <div class="versus-text-adm">
        <span>${esc(admName(m.p1))}</span> <strong>${m.score1}</strong> <span>x</span> <strong>${m.score2}</strong> <span>${esc(admName(m.p2))}</span>
      </div>
      <div class="card-actions">
        <button class="btn btn--secondary btn--sm" data-adm-action="openEditMatchModal" data-id="${m.id}" data-src="${m.src}" data-s1="${m.score1}" data-s2="${m.score2}">Corrigir Placar</button>
      </div>
    </div>`;
}

function renderMatchRowAdmin(m) {
  let sc = m.status === 'done' ? `<strong>${m.score1} x ${m.score2}</strong>` : (m.status === 'live' ? '<span class="status-indicator status-live">AO VIVO</span>' : 'vs');
  return `<div class="match-row-item"><span>${esc(admName(m.p1))}</span> <span class="placar-box">${sc}</span> <span>${esc(admName(m.p2))}</span></div>`;
}

function renderAdmGroups() {
  if (!admState.settings?.groups_drawn) {
    return `<div class="adm-section-head"><h2>Grupos</h2></div><div class="empty-state"><h3>Grupos ainda não sorteados</h3></div>`;
  }
  const cards = GROUP_LETTERS.map(letter => {
    const standings = computeStandings(letter, admState.players, admState.groupMatches);
    const matches = admState.groupMatches.filter(m => m.group_letter === letter).sort((a,b) => (a.order_index??0) - (b.order_index??0));
    const complete = groupComplete(letter, admState.groupMatches);
    const rows = standings.map((t, i) => `<tr class="${i < 2 ? 'qualified' : ''}"><td class="name-cell">${i < 2 ? '<span class="qual-dot"></span>' : ''}${esc(admName(t.id))}</td><td>${t.played}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gd > 0 ? '+' : ''}${t.gd}</td><td>${t.pts}</td></tr>`).join('');
    
    // CORRIGIDO: Modificado visualmente de /4 para /3
    return `
    <div class="group-card">
      <div class="group-card__head"><h3>Grupo ${letter}</h3><span class="group-card__badge">${complete ? '✓' : matches.filter(m => m.status === 'done').length + '/3'}</span></div>
      <table class="standings"><thead><tr><th>Jogador</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>PTS</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="group-card__matches">${matches.map(renderMatchRowAdmin).join('')}</div>
    </div>`;
  }).join('');

  const koReady = allGroupsComplete(admState.groupMatches);
  return `
    <div class="adm-section-head">
      <div><h2>Grupos</h2><p>Os 2 primeiros de cada grupo avançam ao mata-mata.</p></div>
      ${koReady && !admState.settings.knockout_generated ? `<div class="adm-section-actions"><button class="btn btn--live" data-adm-action="generateBracket">Gerar chave do mata-mata</button></div>` : ''}
    </div>
    <div class="groups-grid">${cards}</div>`;
}

function renderAdmKnockout() {
  // CORRIGIDO: Se a trava visual forçar o bloqueio mesmo com a função atualizada, você pode comentar as 4 linhas abaixo para forçar a abertura
  if (!allGroupsComplete(admState.groupMatches)) {
    return `<div class="adm-section-head"><h2>Mata-mata</h2></div><div class="empty-state"><h3>Conclua a fase de grupos primeiro</h3></div>`;
  }
  if (!admState.settings?.knockout_generated) {
    return `
      <div class="adm-section-head"><h2>Mata-mata</h2></div>
      <div class="empty-state">
        <h3>Mata-mata pronto para ser gerado</h3>
        <p>Todos os jogos de grupo acabaram! Clique no botão para estruturar as Oitavas de Final de forma automática.</p>
        <button class="btn btn--live" style="margin-top:1rem;" data-adm-action="generateBracket">Montar Árvore de Playoffs</button>
      </div>`;
  }

  const rounds = ['r16', 'qf', 'sf', 'final'];
  const roundLabels = { r16: 'Oitavas de Final', qf: 'Quartas de Final', sf: 'Semifinais', final: 'Grande Final' };

  const columns = rounds.map(r => {
    const mm = admState.knockoutMatches.filter(m => m.round === r).sort((a,b) => a.match_index - b.match_index);
    const cards = mm.map(m => {
      let s1 = m.status === 'done' ? m.score1 : '--';
      let s2 = m.status === 'done' ? m.score2 : '--';
      if (m.status === 'live') { s1 = `<span class="live-score">${m.score1}</span>`; s2 = `<span class="live-score">${m.score2}</span>`; }
      return `
        <div class="ko-match-node ${m.status === 'live' ? 'node-live' : ''}">
          <div class="ko-player-slot"><span>${m.p1 ? esc(admName(m.p1)) : '<i>A definir</i>'}</span> <span class="ko-score">${s1}</span></div>
          <div class="ko-player-slot"><span>${m.p2 ? esc(admName(m.p2)) : '<i>A definir</i>'}</span> <span class="ko-score">${s2}</span></div>
        </div>`;
    }).join('');
    return `<div class="ko-column"><h3>${roundLabels[r]}</h3><div class="ko-column-matches">${cards}</div></div>`;
  }).join('');

  const tMatch = admState.knockoutMatches.find(m => m.round === 'third');
  let thirdHtml = '';
  if (tMatch) {
    let s1 = tMatch.status === 'done' ? tMatch.score1 : '--';
    let s2 = tMatch.status === 'done' ? tMatch.score2 : '--';
    thirdHtml = `
      <div class="panel" style="margin-top:2rem; max-width:300px;">
        <h3>Disputa de 3º Lugar</h3>
        <div class="ko-match-node" style="margin-top:1rem;">
          <div class="ko-player-slot"><span>${esc(admName(tMatch.p1))}</span> <span class="ko-score">${s1}</span></div>
          <div class="ko-player-slot"><span>${esc(admName(tMatch.p2))}</span> <span class="ko-score">${s2}</span></div>
        </div>
      </div>`;
  }

  return `<div class="adm-section-head"><h2>Árvore de Playoffs</h2></div><div class="ko-bracket-wrapper">${columns}</div>${thirdHtml}`;
}

function renderAdmSettings() {
  const s = admState.settings || {};
  return `
    <div class="adm-section-head"><h2>Configurações do Sistema</h2></div>
    <div class="two-col-grid">
      <div class="panel">
        <h3>Tempos de Partida (Minutos)</h3>
        <div class="form-group"><label>Fase de Grupos</label><input type="number" id="cfg-group_game_min" value="${s.group_game_min||10}"></div>
        <div class="form-group"><label>Oitavas de Final</label><input type="number" id="cfg-r16_game_min" value="${s.r16_game_min||12}"></div>
        <div class="form-group"><label>Quartas de Final</label><input type="number" id="cfg-qf_game_min" value="${s.qf_game_min||12}"></div>
        <div class="form-group"><label>Semifinais</label><input type="number" id="cfg-sf_game_min" value="${s.sf_game_min||15}"></div>
        <div class="form-group"><label>Disputa Terceiro</label><input type="number" id="cfg-third_game_min" value="${s.third_game_min||12}"></div>
        <div class="form-group"><label>Grande Final</label><input type="number" id="cfg-final_game_min" value="${s.final_game_min||15}"></div>
        <div class="form-group"><label>Transição entre jogos (minutos)</label><input type="number" id="cfg-transition_min" value="${s.transition_min||3}"></div>
        <div class="form-group"><label>Quantidade de Estações de PS5 Simultâneas</label><input type="number" id="cfg-stations" value="${s.stations||2}"></div>
        <button class="btn" style="margin-top:1rem;" data-adm-action="saveSettings">Salvar Configurações</button>
      </div>
      <div class="panel panel--danger">
        <h3>Zona de Perigo Absoluto</h3>
        <p>A ação abaixo apaga todos os jogos, deleta a lista de jogadores e limpa totalmente o banco de dados do Supabase. Não pode ser desfeita.</p>
        <button class="btn btn--danger" style="margin-top:1.5rem;" data-adm-action="resetTournament">RESETAR CAMPEONATO DO ZERO</button>
      </div>
    </div>`;
}

// ------------------------------------------------------------
// MODAIS DE SUPORTE
// ------------------------------------------------------------
function openSubstituteModal(playerId) {
  const p = admState.players.find(x => x.id === playerId);
  const options = admState.waitlist.filter(w => !w.used).map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
  
  const html = `
    <div class="modal-overlay" id="adm-modal">
      <div class="modal-card">
        <h3>Substituir Jogador</h3>
        <p>Substituir o titular <strong>${esc(p.name)}</strong> por alguém da lista de espera. Os jogos já concluídos permanecem inalterados.</p>
        <div class="form-group" style="margin-top:1rem;">
          <label>Selecione o Substituto:</label>
          <select id="sub-waitlist-id">${options || '<option value="">Ninguém disponível na espera</option>'}</select>
        </div>
        <div class="modal-buttons" style="margin-top:1.5rem;">
          <button class="btn btn--secondary" onclick="closeAdmModal()">Cancelar</button>
          <button class="btn btn--danger" data-adm-action="confirmSubstitute" data-old-id="${playerId}">Efetivar Substituição</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function openWoModal(matchId, src) {
  const html = `
    <div class="modal-overlay" id="adm-modal">
      <div class="modal-card">
        <h3>Aplicar Vitória por W.O.</h3>
        <p>Escolha qual jogador receberá a vitória por 2x0 devido ao não comparecimento do adversário.</p>
        <div class="modal-buttons" style="margin-top:1.5rem;">
          <button class="btn btn--secondary" onclick="closeAdmModal()">Cancelar</button>
          <button class="btn" data-adm-action="confirmWo" data-id="${matchId}" data-src="${src}" data-side="1">Dar Vitória ao Jogador 1</button>
          <button class="btn" data-adm-action="confirmWo" data-id="${matchId}" data-src="${src}" data-side="2">Dar Vitória ao Jogador 2</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function openEditMatchModal(matchId, src, s1, s2) {
  const html = `
    <div class="modal-overlay" id="adm-modal">
      <div class="modal-card">
        <h3>Corrigir Placar Final</h3>
        <p>Insira os valores reais da partida para recomputar as tabelas.</p>
        <div class="form-group inline-form" style="margin-top:1rem; justify-content:center;">
          <input type="number" id="edit-score-1" value="${s1}" style="width:60px; text-align:center;">
          <span>x</span>
          <input type="number" id="edit-score-2" value="${s2}" style="width:60px; text-align:center;">
        </div>
        <div class="modal-buttons" style="margin-top:1.5rem;">
          <button class="btn btn--secondary" onclick="closeAdmModal()">Cancelar</button>
          <button class="btn" data-adm-action="confirmEditMatch" data-id="${matchId}" data-src="${src}">Salvar Alteração</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeAdmModal() {
  const m = document.getElementById('adm-modal');
  if (m) m.remove();
}

// ------------------------------------------------------------
// ORQUESTRAÇÃO DE REQUISIÇÕES (API FETCH)
// ------------------------------------------------------------
async function admFetch(url, body = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (!d.ok) alert(d.msg || 'Ocorreu um erro na operação.');
    return d.ok;
  } catch (e) {
    alert('Erro de conexão com o servidor.');
    return false;
  }
}

async function reloadAdminData() {
  try {
    const res = await fetch('/api/public/state');
    const data = await res.json();
    admState.players = data.players || [];
    admState.groupMatches = data.groupMatches || [];
    admState.knockoutMatches = data.knockoutMatches || [];
    admState.settings = data.settings || null;
    
    const wRes = await fetch('/api/admin/waitlist-list', { method: 'POST' });
    const wData = await wRes.json();
    if(wData.ok) admState.waitlist = wData.data || [];

    renderActiveTab();
  } catch (e) {
    console.error("Erro ao carregar dados do admin", e);
  }
}

// ------------------------------------------------------------
// CAPTURA AUTOMÁTICA DE CLIQUES (DELEGATION)
// ------------------------------------------------------------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-adm-action]');
  if (!btn) return;

  const action = btn.getAttribute('data-adm-action');
  
  if (action === 'addPlayer') {
    const name = document.getElementById('new-player-name')?.value;
    if(await admFetch('/api/admin/player-add', { name })) { reloadAdminData(); }
  }
  else if (action === 'removePlayer') {
    if(confirm('Tem certeza?')) {
      const id = btn.getAttribute('data-id');
      if(await admFetch('/api/admin/player-remove', { id })) { reloadAdminData(); }
    }
  }
  else if (action === 'addWaitlist') {
    const name = document.getElementById('new-wait-name')?.value;
    if(await admFetch('/api/admin/waitlist-add', { name })) { reloadAdminData(); }
  }
  else if (action === 'openSubstituteModal') {
    openSubstituteModal(btn.getAttribute('data-id'));
  }
  else if (action === 'confirmSubstitute') {
    const oldPlayerId = btn.getAttribute('data-old-id');
    const waitlistId = document.getElementById('sub-waitlist-id')?.value;
    if(!waitlistId) return alert('Selecione um suplente válido.');
    if(await admFetch('/api/admin/player-substitute', { oldPlayerId, waitlistId })) {
      closeAdmModal();
      reloadAdminData();
    }
  }
  else if (action === 'drawGroups') {
    if(confirm('Isso vai apagar jogos antigos se houver e criar 8 grupos de 3 jogadores. Continuar?')) {
      if(await admFetch('/api/admin/groups-draw')) { reloadAdminData(); }
    }
  }
  else if (action === 'startTournament') {
    if(await admFetch('/api/admin/tournament-start')) { reloadAdminData(); }
  }
  else if (action === 'start') {
    const id = btn.getAttribute('data-id');
    const source = btn.getAttribute('data-src');
    if(await admFetch('/api/admin/match-start', { id, source })) { reloadAdminData(); }
  }
  else if (action === 'score') {
    const id = btn.getAttribute('data-id');
    const source = btn.getAttribute('data-src');
    const side = parseInt(btn.getAttribute('data-side'));
    const delta = parseInt(btn.getAttribute('data-delta'));
    
    // Atualiza otimista na tela para resposta imediata
    const el = document.getElementById(`score-val-${id}-${side}`);
    if(el) el.innerText = Math.max(0, parseInt(el.innerText) + delta);

    await fetch('/api/admin/match-score', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, source, side, delta })
    });
  }
  else if (action === 'finish') {
    const id = btn.getAttribute('data-id');
    const source = btn.getAttribute('data-src');
    const score1 = parseInt(document.getElementById(`score-val-${id}-1`)?.innerText || '0');
    const score2 = parseInt(document.getElementById(`score-val-${id}-2`)?.innerText || '0');
    if(await admFetch('/api/admin/match-finish', { id, source, score1, score2 })) { reloadAdminData(); }
  }
  else if (action === 'openWoModal') {
    openWoModal(btn.getAttribute('data-id'), btn.getAttribute('data-src'));
  }
  else if (action === 'confirmWo') {
    const id = btn.getAttribute('data-id');
    const source = btn.getAttribute('data-src');
    const winnerSide = parseInt(btn.getAttribute('data-side'));
    if(await admFetch('/api/admin/match-wo', { id, source, winnerSide })) {
      closeAdmModal();
      reloadAdminData();
    }
  }
  else if (action === 'openEditMatchModal') {
    openEditMatchModal(btn.getAttribute('data-id'), btn.getAttribute('data-src'), btn.getAttribute('data-s1'), btn.getAttribute('data-s2'));
  }
  else if (action === 'confirmEditMatch') {
    const id = btn.getAttribute('data-id');
    const source = btn.getAttribute('data-src');
    const score1 = parseInt(document.getElementById('edit-score-1')?.value || '0');
    const score2 = parseInt(document.getElementById('edit-score-2')?.value || '0');
    if(await admFetch('/api/admin/match-edit', { id, source, score1, score2 })) {
      closeAdmModal();
      reloadAdminData();
    }
  }
  else if (action === 'generateBracket') {
    if(await admFetch('/api/admin/knockout-generate')) { reloadAdminData(); setTab('knockout'); }
  }
  else if (action === 'saveSettings') {
    const patch = {
      group_game_min: parseInt(document.getElementById('cfg-group_game_min')?.value || '10'),
      r16_game_min: parseInt(document.getElementById('cfg-r16_game_min')?.value || '12'),
      qf_game_min: parseInt(document.getElementById('cfg-qf_game_min')?.value || '12'),
      sf_game_min: parseInt(document.getElementById('cfg-sf_game_min')?.value || '15'),
      third_game_min: parseInt(document.getElementById('cfg-third_game_min')?.value || '12'),
      final_game_min: parseInt(document.getElementById('cfg-final_game_min')?.value || '15'),
      transition_min: parseInt(document.getElementById('cfg-transition_min')?.value || '3'),
      stations: parseInt(document.getElementById('cfg-stations')?.value || '2')
    };
    if(await admFetch('/api/admin/settings-update', { patch })) { alert('Configurações salvas!'); reloadAdminData(); }
  }
  else if (action === 'resetTournament') {
    if(confirm('ATENÇÃO CRÍTICA:\n\nIsso vai apagar ABSOLUTAMENTE TUDO do banco de dados (jogadores, chaves, resultados). Tem certeza absoluta?')) {
      if(await admFetch('/api/admin/tournament-reset')) { window.location.reload(); }
    }
  }
});

// Configura os ouvintes de clique do menu de navegação
document.querySelectorAll('.adm-nav-item').forEach(el => {
  el.addEventListener('click', () => {
    setTab(el.getAttribute('data-tab'));
  });
});

// Inicialização automática
reloadAdminData();
setInterval(reloadAdminData, 10000); // polling a cada 10s para manter o painel vivo