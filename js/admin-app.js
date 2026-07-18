/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   js/admin-app.js — painel do organizador (/adm)
   ============================================================ */

let admState = { settings:null, players:[], groupMatches:[], koMatches:[], waitlist:[] };
let admTab = 'players';
let admMatchFilter = 'all';
let admChannel = null;

function admName(id){ return getPlayerName(admState.players, id); }

/* ---------------- boot ---------------- */
(async function initAdmin(){
  const authed = await adminCheckSession();
  if(authed) showAdminDashboard();
  else showAdminLogin();
})();

function showAdminLogin(){
  if(admChannel){ admChannel.unsubscribe(); admChannel = null; }
  document.getElementById('admRoot').innerHTML = `
    <div class="adm-login">
      <div class="adm-login__box">
        <img src="../assets/logo.png" class="adm-login__logo" alt="Hangar World">
        <h1 class="adm-login__title">Painel do Organizador</h1>
        <p class="adm-login__subtitle">Acesso restrito — Campeonato FC26, Hangar World.</p>
        <div class="field"><label>PIN</label><input type="password" inputmode="numeric" class="input" id="admPinInput" placeholder="••••" maxlength="12"></div>
        <button class="btn btn--primary btn--block" id="admLoginBtn">Entrar</button>
        <p class="helper-text" id="admLoginError" style="color:var(--danger);min-height:16px;margin-top:10px;"></p>
      </div>
    </div>`;
  document.getElementById('admLoginBtn').addEventListener('click', doAdminLogin);
  document.getElementById('admPinInput').addEventListener('keydown', e=>{ if(e.key==='Enter') doAdminLogin(); });
  document.getElementById('admPinInput').focus();
}

async function doAdminLogin(){
  const pin = document.getElementById('admPinInput').value.trim();
  const r = await adminLogin(pin);
  if(r.ok) showAdminDashboard();
  else document.getElementById('admLoginError').textContent = r.error || 'PIN incorreto.';
}

async function showAdminDashboard(){
  document.getElementById('admRoot').innerHTML = `
    <div class="adm-shell">
      <aside class="adm-sidebar">
        <div class="adm-sidebar__brand">
          <img src="../assets/logo.png" class="adm-sidebar__logo" alt="Hangar World">
          <span class="adm-sidebar__title">Hangar World<br>FC26 Admin</span>
        </div>
        <nav class="adm-nav" id="admNav">
          <button class="adm-navlink" data-tab="players">Jogadores</button>
          <button class="adm-navlink" data-tab="schedule">Cronograma</button>
          <button class="adm-navlink" data-tab="matches">Partidas</button>
          <button class="adm-navlink" data-tab="groups">Grupos</button>
          <button class="adm-navlink" data-tab="bracket">Mata-mata</button>
          <button class="adm-navlink" data-tab="settings">Configurações</button>
        </nav>
        <div class="adm-sidebar__footer">
          <div class="adm-sidebar__phase" id="admPhaseLabel"></div>
          <button class="btn btn--ghost btn--sm btn--block" id="admLogoutBtn">Sair</button>
        </div>
      </aside>
      <main class="adm-main" id="admMain"></main>
    </div>`;

  document.getElementById('admNav').addEventListener('click', e=>{
    const btn = e.target.closest('[data-tab]');
    if(!btn) return;
    admTab = btn.dataset.tab;
    renderAdminTab();
  });
  document.getElementById('admLogoutBtn').addEventListener('click', async ()=>{
    await adminLogout();
    showAdminLogin();
  });

  await loadAdminData();
  if(!admChannel) admChannel = subscribeRealtime(async ()=>{ await loadAdminData(); });
}

async function loadAdminData(){
  const [settings, players, groupMatches, koMatches, waitlistRes] = await Promise.all([
    fetchTournamentState(), fetchPlayers(), fetchGroupMatches(), fetchKnockoutMatches(),
    adminAction('listWaitlist', {}),
  ]);
  admState = { settings, players, groupMatches, koMatches, waitlist: (waitlistRes && waitlistRes.data) || [] };
  const phaseEl = document.getElementById('admPhaseLabel');
  if(phaseEl){
    const labels = { setup:'Cadastro', groups:'Fase de grupos', knockout:'Mata-mata', finished:'Encerrado' };
    phaseEl.textContent = labels[settings?.phase] || '';
  }
  document.querySelectorAll('.adm-navlink').forEach(b=> b.classList.toggle('is-active', b.dataset.tab===admTab));
  renderAdminTab();
}

function renderAdminTab(){
  document.querySelectorAll('.adm-navlink').forEach(b=> b.classList.toggle('is-active', b.dataset.tab===admTab));
  const main = document.getElementById('admMain');
  if(!main) return;
  const renderers = { players: renderAdmPlayers, schedule: renderAdmSchedule, matches: renderAdmMatches, groups: renderAdmGroups, bracket: renderAdmBracket, settings: renderAdmSettings };
  main.innerHTML = renderers[admTab] ? renderers[admTab]() : '';
  wireAdminTabEvents();
}

/* ================= JOGADORES ================= */
function renderAdmPlayers(){
  const drawn = admState.settings?.groups_drawn;
  const active = admState.players.filter(p=>p.is_active);
  const rows = active.map((p,i)=>`
    <div class="player-row">
      <span class="player-row__num">${String(i+1).padStart(2,'0')}</span>
      <span class="player-row__name">${esc(p.name)}</span>
      ${p.group_letter ? `<span class="player-row__group">Grupo ${p.group_letter}</span>` : ''}
      ${!drawn ? `<button class="player-row__remove" data-adm-action="removePlayer" data-id="${p.id}">✕</button>` : ''}
    </div>`).join('') || `<div class="empty-state"><h3>Nenhum jogador cadastrado</h3></div>`;

  const waitlistRows = admState.waitlist.map(w=>`
    <div class="player-row">
      <span class="player-row__name">${esc(w.name)}</span>
      <span class="tag ${w.used ? 'tag--done':'tag--wait'}">${w.used ? 'Já utilizado' : 'Disponível'}</span>
    </div>`).join('') || `<p class="helper-text">Nenhum nome na lista de espera ainda.</p>`;

  const availableWaitlist = admState.waitlist.filter(w=>!w.used);

  return `
    <div class="adm-section-head">
      <div><h2>Jogadores</h2><p>${active.length} de 24 cadastrados${drawn? ' — grupos já sorteados':''}.</p></div>
      ${!drawn ? `<div class="adm-section-actions"><button class="btn btn--primary" data-adm-action="drawGroups" ${active.length!==24?'disabled':''}>Sortear grupos</button></div>` : ''}
    </div>

    ${!drawn ? `
    <div class="panel">
      <h4>Adicionar jogador</h4>
      <div class="inline-fields">
        <div class="field"><label>Nome</label><input type="text" class="input" id="newPlayerName" placeholder="Ex: João Silva" maxlength="40"></div>
        <button class="btn btn--ghost" data-adm-action="addPlayer">Adicionar</button>
      </div>
      <hr class="divider">
      <div class="field"><label>Cadastro em lote (um nome por linha)</label><textarea class="input" id="bulkPlayerNames" placeholder="João Silva
Maria Souza"></textarea></div>
      <button class="btn btn--ghost" data-adm-action="addPlayersBulk">Adicionar lista</button>
    </div>` : ''}

    <div class="two-col">
      <div class="panel player-list"><h4>Jogadores ativos</h4>${rows}</div>
      <div class="panel">
        <h4>Lista de espera / substitutos</h4>
        <div class="inline-fields" style="margin-bottom:14px;">
          <div class="field"><label>Nome do substituto</label><input type="text" class="input" id="waitlistName" placeholder="Nome"></div>
          <button class="btn btn--ghost" data-adm-action="addWaitlist">Adicionar à lista</button>
        </div>
        ${waitlistRows}
        ${drawn && availableWaitlist.length ? `
        <hr class="divider">
        <h4>Substituir jogador</h4>
        <div class="field"><label>Jogador que vai sair</label>
          <select class="input" id="subOldPlayer">${active.map(p=>`<option value="${p.id}">${esc(p.name)} (Grupo ${p.group_letter})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Substituto da lista de espera</label>
          <select class="input" id="subWaitlist">${availableWaitlist.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select>
        </div>
        <button class="btn btn--danger btn--block" data-adm-action="substitutePlayer">Confirmar substituição</button>
        <p class="helper-text">Só as partidas que o titular ainda não jogou serão transferidas para o substituto.</p>
        ` : ''}
      </div>
    </div>`;
}

/* ================= CRONOGRAMA ================= */
function renderAdmSchedule(){
  const s = admState.settings;
  if(!s?.groups_drawn){
    return `<div class="adm-section-head"><h2>Cronograma</h2></div><div class="empty-state"><h3>Sorteie os grupos primeiro</h3></div>`;
  }
  const stations = s.stations || 2;
  const allMatches = [...admState.groupMatches, ...admState.koMatches].sort((a,b)=>(a.order_index??0)-(b.order_index??0));

  const cols = [];
  for(let st=1; st<=stations; st++){
    const items = allMatches.filter(m=>m.station===st);
    cols.push(`<div>
      <div class="timeline-col__head">PS5 · Estação ${st}</div>
      ${items.map(m=>`<div class="slot">
        <span class="slot__time">${s.tournament_started ? formatTime(m.scheduled_time) : '--:--'}</span>
        <div class="slot__body"><div class="slot__phase">${matchLabel(m)}</div>${esc(admName(m.p1))} vs ${esc(admName(m.p2))}</div>
        ${matchStatusTagAdmin(m)}
      </div>`).join('')}
    </div>`);
  }

  return `
    <div class="adm-section-head">
      <div><h2>Cronograma</h2><p>${s.tournament_started ? 'Campeonato em andamento — horários recalculados automaticamente a cada partida encerrada.' : 'Clique em "Começar campeonato" para gerar os horários a partir de agora.'}</p></div>
      <div class="adm-section-actions">
        ${!s.tournament_started ? `<button class="btn btn--primary" data-adm-action="startTournament">▶ Começar campeonato</button>` : `<span class="tag tag--live"><span class="livedot"></span> Iniciado às ${formatTime(s.started_at)}</span>`}
      </div>
    </div>
    <div class="panel" style="margin-bottom:20px;">
      <h4>Durações por fase (jogo + ${s.transition_min} min de preparação)</h4>
      <p class="helper-text">Grupos: ${s.group_game_min} min · Oitavas/Quartas: ${s.r16_game_min}/${s.qf_game_min} min · Semifinal: ${s.sf_game_min} min · 3º lugar: ${s.third_game_min} min · Final: ${s.final_game_min} min. Para alterar, vá em Configurações.</p>
    </div>
    <div class="timeline-cols">${cols.join('')}</div>`;
}

function matchStatusTagAdmin(m){
  if(m.status==='live') return `<span class="tag tag--live"><span class="livedot"></span></span>`;
  if(m.status==='done') return m.wo ? `<span class="tag tag--wo">W.O.</span>` : `<span class="tag tag--done">✓</span>`;
  return `<span class="tag tag--wait">Aguardando</span>`;
}

/* ================= PARTIDAS ================= */
function renderAdmMatches(){
  if(!admState.settings?.groups_drawn){
    return `<div class="adm-section-head"><h2>Partidas</h2></div><div class="empty-state"><h3>Sorteie os grupos primeiro</h3></div>`;
  }
  let all = [...admState.groupMatches.map(m=>({...m, source:'group'})), ...admState.koMatches.map(m=>({...m, source:'knockout'}))];
  all.sort((a,b)=>(a.order_index??0)-(b.order_index??0));

  if(admMatchFilter==='live') all = all.filter(m=>m.status==='live');
  else if(admMatchFilter==='waiting') all = all.filter(m=>m.status==='waiting' && m.p1 && m.p2);
  else if(admMatchFilter==='done') all = all.filter(m=>m.status==='done');

  const cards = all.map(renderAdmMatchCard).join('') || `<div class="empty-state"><h3>Nenhuma partida nesse filtro</h3></div>`;

  return `
    <div class="adm-section-head"><div><h2>Partidas</h2><p>Inicie, atualize o placar ao vivo e encerre cada confronto.</p></div></div>
    <div class="filter-bar">
      <button class="filter-chip ${admMatchFilter==='all'?'is-active':''}" data-adm-action="filterMatches" data-filter="all">Todas</button>
      <button class="filter-chip ${admMatchFilter==='waiting'?'is-active':''}" data-adm-action="filterMatches" data-filter="waiting">Aguardando</button>
      <button class="filter-chip ${admMatchFilter==='live'?'is-active':''}" data-adm-action="filterMatches" data-filter="live">Ao vivo</button>
      <button class="filter-chip ${admMatchFilter==='done'?'is-active':''}" data-adm-action="filterMatches" data-filter="done">Concluídas</button>
    </div>
    ${cards}`;
}

function renderAdmMatchCard(m){
  const ready = !!(m.p1 && m.p2);
  const s1 = m.score1 ?? 0, s2 = m.score2 ?? 0;
  let actions = '';
  if(!ready){
    actions = `<p class="helper-text">Aguardando definição dos classificados.</p>`;
  } else if(m.status==='waiting'){
    actions = `
      <button class="btn btn--primary btn--sm" data-adm-action="startMatch" data-id="${m.id}" data-source="${m.source}">▶ Iniciar</button>
      <button class="btn btn--ghost btn--sm" data-adm-action="woModal" data-id="${m.id}" data-source="${m.source}">Registrar W.O.</button>`;
  } else if(m.status==='live'){
    actions = `<button class="btn btn--live btn--sm" data-adm-action="finishMatch" data-id="${m.id}" data-source="${m.source}">⏹ Encerrar e confirmar placar</button>`;
  } else {
    actions = `<button class="btn btn--ghost btn--sm" data-adm-action="editMatch" data-id="${m.id}" data-source="${m.source}">✎ Editar placar</button>`;
  }
  const stepperDisabled = m.status !== 'live';

  return `
  <div class="match-card">
    <div class="match-card__top"><span class="match-card__phase">${matchLabel(m)}</span>${matchStatusTagAdmin(m)}</div>
    <div class="match-card__body">
      <div class="match-card__player"><div class="match-card__player-name">${ready?esc(admName(m.p1)):'—'}</div></div>
      <div class="match-card__center">
        <div class="scoreboard">
          <div class="match-card__stepper">
            <button class="stepper-btn" ${stepperDisabled?'disabled':''} data-adm-action="scoreStep" data-id="${m.id}" data-source="${m.source}" data-side="1" data-delta="1">+</button>
            <button class="stepper-btn" ${stepperDisabled?'disabled':''} data-adm-action="scoreStep" data-id="${m.id}" data-source="${m.source}" data-side="1" data-delta="-1">−</button>
          </div>
          <span class="scoreboard__digit">${ready?s1:'-'}</span><span class="scoreboard__sep">:</span><span class="scoreboard__digit">${ready?s2:'-'}</span>
          <div class="match-card__stepper">
            <button class="stepper-btn" ${stepperDisabled?'disabled':''} data-adm-action="scoreStep" data-id="${m.id}" data-source="${m.source}" data-side="2" data-delta="1">+</button>
            <button class="stepper-btn" ${stepperDisabled?'disabled':''} data-adm-action="scoreStep" data-id="${m.id}" data-source="${m.source}" data-side="2" data-delta="-1">−</button>
          </div>
        </div>
      </div>
      <div class="match-card__player"><div class="match-card__player-name">${ready?esc(admName(m.p2)):'—'}</div></div>
    </div>
    <div class="match-card__actions">${actions}</div>
  </div>`;
}

/* ================= GRUPOS ================= */
function renderAdmGroups(){
  if(!admState.settings?.groups_drawn){
    return `<div class="adm-section-head"><h2>Grupos</h2></div><div class="empty-state"><h3>Grupos ainda não sorteados</h3></div>`;
  }
  const cards = GROUP_LETTERS.map(letter=>{
    const standings = computeStandings(letter, admState.players, admState.groupMatches);
    const matches = admState.groupMatches.filter(m=>m.group_letter===letter).sort((a,b)=>(a.order_index??0)-(b.order_index??0));
    const complete = groupComplete(letter, admState.groupMatches);
    const rows = standings.map((t,i)=>`<tr class="${i<2?'qualified':''}"><td class="name-cell">${i<2?'<span class="qual-dot"></span>':''}${esc(admName(t.id))}</td><td>${t.played}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gd>0?'+':''}${t.gd}</td><td>${t.pts}</td></tr>`).join('');
    
    // Mudamos o '/4' para '/3' na linha abaixo para mostrar o progresso real do grupo
    return `<div class="group-card">
      <div class="group-card__head"><h3>Grupo ${letter}</h3><span class="group-card__badge">${complete?'✓':matches.filter(m=>m.status==='done').length+'/3'}</span></div>
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

function renderMatchRowAdmin(m){
  const w1 = m.status==='done' && m.score1>m.score2;
  const w2 = m.status==='done' && m.score2>m.score1;
  const score = m.status==='waiting' ? `<span class="match-row__vs">vs</span>` : `<span class="match-row__score">${m.score1}:${m.score2}</span>`;
  return `<div class="match-row ${m.status==='live'?'is-live':''}">
    <span class="match-row__side ${w1?'match-row__winner':''}">${esc(admName(m.p1))}</span>${score}
    <span class="match-row__side match-row__side--right ${w2?'match-row__winner':''}">${esc(admName(m.p2))}</span>
    ${matchStatusTagAdmin(m)}
  </div>`;
}

/* ================= MATA-MATA ================= */
function renderAdmBracket(){
  if(!admState.settings?.knockout_generated){
    const koReady = allGroupsComplete(admState.groupMatches);
    return `<div class="adm-section-head"><h2>Mata-mata</h2></div><div class="empty-state"><h3>${koReady ? 'Pronto para gerar a chave' : 'Conclua a fase de grupos primeiro'}</h3>
      ${koReady ? `<div style="margin-top:14px;"><button class="btn btn--primary" data-adm-action="generateBracket">Gerar chave do mata-mata</button></div>` : ''}</div>`;
  }
  const rounds = ['r16','qf','sf','third','final'].map(round=>{
    const matches = admState.koMatches.filter(m=>m.round===round).sort((a,b)=>(a.match_index??0)-(b.match_index??0));
    if(!matches.length) return '';
    const html = matches.map(m=>{
      const ready = m.p1 && m.p2;
      const w1 = m.status==='done' && m.score1>m.score2, w2 = m.status==='done' && m.score2>m.score1;
      const sc1 = m.status!=='waiting' ? `<span class="bmatch__score">${m.score1??''}</span>` : '';
      const sc2 = m.status!=='waiting' ? `<span class="bmatch__score">${m.score2??''}</span>` : '';
      return `<div class="bmatch ${!ready?'bmatch--empty':''} ${round==='third'?'bmatch--third':''}">
        <div class="bmatch__p ${w1?'win':''}">${ready?esc(admName(m.p1)):'A definir'}${sc1}</div>
        <div class="bmatch__p ${w2?'win':''}">${ready?esc(admName(m.p2)):'A definir'}${sc2}</div>
      </div>`;
    }).join('<div style="height:8px"></div>');
    return `<div class="bracket__round"><div class="bracket__round-title">${roundLabel(round)}</div>${html}</div>`;
  }).join('');

  return `<div class="adm-section-head"><div><h2>Mata-mata</h2><p>Jogo único. Registre os placares na aba Partidas.</p></div></div>
    <div class="bracket-wrap"><div class="bracket">${rounds}</div></div>`;
}

/* ================= CONFIGURAÇÕES ================= */
function renderAdmSettings(){
  const s = admState.settings || {};
  const locked = s.tournament_started;
  return `
    <div class="adm-section-head"><h2>Configurações</h2></div>
    <div class="panel">
      <h4>Duração das partidas (minutos de jogo)</h4>
      ${locked ? `<p class="helper-text">O campeonato já começou — alterar durações agora só afeta partidas que ainda serão agendadas. Use com cuidado.</p>` : ''}
      <div class="inline-fields">
        <div class="field"><label>Grupos</label><input type="number" min="1" class="input" id="cfgGroup" value="${s.group_game_min??5}"></div>
        <div class="field"><label>Oitavas</label><input type="number" min="1" class="input" id="cfgR16" value="${s.r16_game_min??6}"></div>
        <div class="field"><label>Quartas</label><input type="number" min="1" class="input" id="cfgQf" value="${s.qf_game_min??6}"></div>
        <div class="field"><label>Semifinal</label><input type="number" min="1" class="input" id="cfgSf" value="${s.sf_game_min??7}"></div>
        <div class="field"><label>3º lugar</label><input type="number" min="1" class="input" id="cfgThird" value="${s.third_game_min??7}"></div>
        <div class="field"><label>Final</label><input type="number" min="1" class="input" id="cfgFinal" value="${s.final_game_min??8}"></div>
      </div>
      <div class="inline-fields" style="margin-top:6px;">
        <div class="field"><label>Preparação entre partidas (min)</label><input type="number" min="0" class="input" id="cfgTransition" value="${s.transition_min??3}"></div>
        <div class="field"><label>Nº de PlayStation 5</label><input type="number" min="1" max="8" class="input" id="cfgStations" value="${s.stations??2}"></div>
      </div>
      <button class="btn btn--primary" data-adm-action="saveSettings">Salvar durações</button>
    </div>

    <div class="panel">
      <h4>Zona de risco</h4>
      <p class="helper-text">Reiniciar apaga jogadores, grupos, partidas e a lista de espera. Não pode ser desfeito.</p>
      <button class="btn btn--danger" data-adm-action="confirmReset">Reiniciar campeonato</button>
    </div>`;
}

/* ================= interações ================= */
function wireAdminTabEvents(){
  // delegação central já cobre cliques; nada extra a fazer aqui por enquanto.
}

document.addEventListener('click', async (e)=>{
  const el = e.target.closest('[data-adm-action]');
  if(!el) return;
  const action = el.dataset.action || el.dataset.admAction;
  const id = el.dataset.id, source = el.dataset.source;

  switch(action){
    case 'addPlayer': {
      const input = document.getElementById('newPlayerName');
      const r = await adminAction('addPlayer', {name: input.value});
      if(r.ok){ input.value=''; await loadAdminData(); } else showToast(r.msg || r.error);
      break;
    }
    case 'addPlayersBulk': {
      const ta = document.getElementById('bulkPlayerNames');
      const r = await adminAction('addPlayersBulk', {text: ta.value});
      showToast(`${r.added||0} adicionado(s)${r.skipped?', '+r.skipped+' ignorado(s)':''}.`);
      await loadAdminData();
      break;
    }
    case 'removePlayer': {
      const r = await adminAction('removePlayer', {id});
      if(!r.ok) showToast(r.msg||r.error); else await loadAdminData();
      break;
    }
    case 'addWaitlist': {
      const input = document.getElementById('waitlistName');
      const r = await adminAction('addWaitlist', {name: input.value});
      if(r.ok){ input.value=''; await loadAdminData(); } else showToast(r.msg||r.error);
      break;
    }
    case 'substitutePlayer': {
      const oldPlayerId = document.getElementById('subOldPlayer').value;
      const waitlistId = document.getElementById('subWaitlist').value;
      const r = await adminAction('substitutePlayer', {oldPlayerId, waitlistId});
      if(r.ok){ showToast('Substituição feita.'); await loadAdminData(); } else showToast(r.msg||r.error);
      break;
    }
    case 'drawGroups': {
      const r = await adminAction('drawGroups', {});
      if(r.ok){ showToast('Grupos sorteados!'); admTab='groups'; await loadAdminData(); } else showToast(r.msg||r.error);
      break;
    }
    case 'startTournament': {
      const r = await adminAction('startTournament', {});
      if(r.ok){ showToast('Campeonato iniciado!'); await loadAdminData(); } else showToast(r.msg||r.error);
      break;
    }
    case 'generateBracket': {
      const r = await adminAction('generateBracket', {});
      if(r.ok){ showToast('Chave do mata-mata gerada!'); admTab='bracket'; await loadAdminData(); } else showToast(r.msg||r.error);
      break;
    }
    case 'filterMatches': admMatchFilter = el.dataset.filter; renderAdminTab(); break;
    case 'startMatch': { await adminAction('startMatch', {id, source}); await loadAdminData(); break; }
    case 'scoreStep': {
      await adminAction('updateLiveScore', {id, source, side: parseInt(el.dataset.side,10), delta: parseInt(el.dataset.delta,10)});
      await loadAdminData();
      break;
    }
    case 'finishMatch': openAdmFinishModal(id, source); break;
    case 'confirmFinish': {
      const s1 = parseInt(document.getElementById('finalScore1').value,10)||0;
      const s2 = parseInt(document.getElementById('finalScore2').value,10)||0;
      const r = await adminAction('finishMatch', {id, source, score1:s1, score2:s2});
      if(!r.ok){ showToast(r.msg||r.error); break; }
      closeModal(); showToast('Resultado confirmado.'); await loadAdminData();
      break;
    }
    case 'editMatch': openAdmFinishModal(id, source, true); break;
    case 'editMatchConfirm': {
      const s1 = parseInt(document.getElementById('finalScore1').value,10)||0;
      const s2 = parseInt(document.getElementById('finalScore2').value,10)||0;
      await adminAction('editMatch', {id, source, score1:s1, score2:s2});
      closeModal(); showToast('Placar atualizado.'); await loadAdminData();
      break;
    }
    case 'woModal': openAdmWOModal(id, source); break;
    case 'confirmWO': {
      const side = parseInt(el.dataset.side,10);
      await adminAction('registerWO', {id, source, winnerSide: side});
      closeModal(); showToast('W.O. registrado.'); await loadAdminData();
      break;
    }
    case 'saveSettings': {
      const payload = {
        group_game_min: parseInt(document.getElementById('cfgGroup').value,10),
        r16_game_min: parseInt(document.getElementById('cfgR16').value,10),
        qf_game_min: parseInt(document.getElementById('cfgQf').value,10),
        sf_game_min: parseInt(document.getElementById('cfgSf').value,10),
        third_game_min: parseInt(document.getElementById('cfgThird').value,10),
        final_game_min: parseInt(document.getElementById('cfgFinal').value,10),
        transition_min: parseInt(document.getElementById('cfgTransition').value,10),
        stations: parseInt(document.getElementById('cfgStations').value,10),
      };
      const r = await adminAction('updateSettings', payload);
      if(r.ok){ showToast('Configurações salvas.'); await loadAdminData(); } else showToast(r.msg||r.error);
      break;
    }
    case 'confirmReset': openAdmResetModal(); break;
    case 'doReset': {
      await adminAction('resetTournament', {});
      closeModal(); showToast('Campeonato reiniciado.'); admTab='players'; await loadAdminData();
      break;
    }
    case 'closeModal': closeModal(); break;
  }
});

function openModal(html){
  document.getElementById('modalRoot').innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal">${html}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }
function showToast(msg){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div'); el.className='toast'; el.textContent=msg;
  root.appendChild(el); setTimeout(()=>el.remove(), 3200);
}

function openAdmFinishModal(id, source, isEdit){
  const list = source==='group' ? admState.groupMatches : admState.koMatches;
  const m = list.find(x=>x.id===id);
  if(!m) return;
  openModal(`
    <h3>${isEdit?'Editar placar':'Confirmar placar final'}</h3>
    <p style="color:var(--muted);font-size:13px;margin:-6px 0 16px;">${esc(admName(m.p1))} vs ${esc(admName(m.p2))}</p>
    <div class="inline-fields">
      <div class="field"><label>${esc(admName(m.p1))}</label><input type="number" min="0" class="input input--score" id="finalScore1" value="${m.score1??0}"></div>
      <div class="field"><label>${esc(admName(m.p2))}</label><input type="number" min="0" class="input input--score" id="finalScore2" value="${m.score2??0}"></div>
    </div>
    <div class="modal__actions">
      <button class="btn btn--ghost" data-adm-action="closeModal">Cancelar</button>
      <button class="btn btn--live" data-adm-action="${isEdit?'editMatchConfirm':'confirmFinish'}" data-id="${id}" data-source="${source}">${isEdit?'Salvar':'Confirmar e encerrar'}</button>
    </div>`);
}

function openAdmWOModal(id, source){
  const list = source==='group' ? admState.groupMatches : admState.koMatches;
  const m = list.find(x=>x.id===id);
  if(!m) return;
  openModal(`
    <h3>Registrar W.O.</h3>
    <p style="color:var(--muted);font-size:13px;margin:-6px 0 16px;">Quem esteve presente? (vitória padrão 2 a 0)</p>
    <button class="btn btn--primary btn--block" style="margin-bottom:8px;" data-adm-action="confirmWO" data-id="${id}" data-source="${source}" data-side="1">${esc(admName(m.p1))} venceu por W.O.</button>
    <button class="btn btn--primary btn--block" data-adm-action="confirmWO" data-id="${id}" data-source="${source}" data-side="2">${esc(admName(m.p2))} venceu por W.O.</button>
    <div class="modal__actions"><button class="btn btn--ghost" data-adm-action="closeModal">Cancelar</button></div>`);
}

function openAdmResetModal(){
  openModal(`
    <h3>Tem certeza?</h3>
    <p style="color:var(--muted);font-size:13.5px;">Isso apaga todos os dados do campeonato no banco. Não pode ser desfeito.</p>
    <div class="modal__actions">
      <button class="btn btn--ghost" data-adm-action="closeModal">Cancelar</button>
      <button class="btn btn--danger" data-adm-action="doReset">Sim, reiniciar tudo</button>
    </div>`);
}
