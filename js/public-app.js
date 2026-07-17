/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   js/public-app.js — página pública (QR code): Ao Vivo / Grupos / Todos os Jogos
   Somente leitura. Toda a escrita acontece no painel /adm.
   ============================================================ */

let pubState = { settings:null, players:[], groupMatches:[], koMatches:[] };
let activeTab = 'live';
let clockTimer2 = null;

async function loadAll(){
  const [settings, players, groupMatches, koMatches] = await Promise.all([
    fetchTournamentState(), fetchPlayers(), fetchGroupMatches(), fetchKnockoutMatches()
  ]);
  pubState = { settings, players, groupMatches, koMatches };
  renderActiveTab();
}

function name(id){ return getPlayerName(pubState.players, id); }

function renderActiveTab(){
  const root = document.getElementById('pubContent');
  document.querySelectorAll('.pub-tab').forEach(t=> t.classList.toggle('is-active', t.dataset.tab===activeTab));
  if(activeTab==='live') root.innerHTML = renderLiveTab();
  else if(activeTab==='groups') root.innerHTML = renderGroupsTab();
  else root.innerHTML = renderAllTab();
}

/* ---------- Ao vivo ---------- */
function renderLiveTab(){
  if(!pubState.settings || !pubState.settings.groups_drawn){
    return `<div class="empty-state"><div class="empty-state__icon">🎮</div><h3>O campeonato ainda não começou</h3><p>Assim que os grupos forem sorteados, as partidas ao vivo aparecem aqui.</p></div>`;
  }
  const stations = pubState.settings.stations || 2;
  const allMatches = [...pubState.groupMatches, ...pubState.koMatches];

  let cards = '';
  for(let s=1; s<=stations; s++){
    const stationMatches = allMatches.filter(m=>m.station===s);
    const live = stationMatches.find(m=>m.status==='live');
    const next = stationMatches.filter(m=>m.status==='waiting').sort((a,b)=> (a.order_index??0)-(b.order_index??0))[0];

    let body;
    if(live){
      body = `
        <div class="station-card__players">
          <div class="station-card__player">${esc(name(live.p1))}</div>
          <div class="station-card__score">
            <span class="station-card__digit">${live.score1 ?? 0}</span>
            <span class="station-card__sep">×</span>
            <span class="station-card__digit">${live.score2 ?? 0}</span>
          </div>
          <div class="station-card__player">${esc(name(live.p2))}</div>
        </div>`;
    } else {
      body = `<div class="station-card__empty">Sem partida ao vivo nesta estação.</div>
        ${next ? `<div class="station-card__next">Próxima: ${esc(name(next.p1))} vs ${esc(name(next.p2))} · ${formatTime(next.scheduled_time)}</div>` : ''}`;
    }

    cards += `
      <div class="station-card ${live?'has-live':''}">
        <div class="station-card__head">
          <span class="station-card__name">PlayStation 5 · Estação ${s}</span>
          <span class="station-card__phase">${live? matchLabel(live) : (next? matchLabel(next) : '')}</span>
        </div>
        <div class="station-card__body">${body}</div>
      </div>`;
  }

  return `<div class="stations-row">${cards}</div>`;
}

/* ---------- Grupos ---------- */
function renderGroupsTab(){
  if(!pubState.settings || !pubState.settings.groups_drawn){
    return `<div class="empty-state"><div class="empty-state__icon">🎲</div><h3>Grupos ainda não sorteados</h3></div>`;
  }
  const cards = GROUP_LETTERS.map(letter=>{
    const standings = computeStandings(letter, pubState.players, pubState.groupMatches);
    const matches = pubState.groupMatches.filter(m=>m.group_letter===letter).sort((a,b)=>(a.order_index??0)-(b.order_index??0));
    const rows = standings.map((t,i)=>`
      <tr class="${i<2?'qualified':''}">
        <td class="name-cell">${i<2?'<span class="qual-dot"></span>':''}${esc(name(t.id))}</td>
        <td>${t.played}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gd>0?'+':''}${t.gd}</td>
        <td class="pts">${t.pts}</td>
      </tr>`).join('');
    return `
    <div class="group-card">
      <div class="group-card__head"><h3>Grupo ${letter}</h3><span class="group-card__badge">${matches.filter(m=>m.status==='done').length}/4</span></div>
      <table class="standings"><thead><tr><th>Jogador</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>PTS</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="group-card__matches">${matches.map(renderMatchRowPublic).join('')}</div>
    </div>`;
  }).join('');
  return `<div class="groups-grid">${cards}</div>`;
}

function renderMatchRowPublic(m){
  const w1 = m.status==='done' && m.score1>m.score2;
  const w2 = m.status==='done' && m.score2>m.score1;
  const score = m.status==='waiting' ? `<span class="match-row__vs">vs</span>` : `<span class="match-row__score">${m.score1} : ${m.score2}</span>`;
  const tag = m.status==='live' ? `<span class="tag tag--live"><span class="livedot"></span></span>`
    : m.status==='done' ? `<span class="tag tag--done">✓</span>` : `<span class="tag tag--wait">${formatTime(m.scheduled_time)}</span>`;
  return `<div class="match-row ${m.status==='live'?'is-live':''}">
    <span class="match-row__side ${w1?'match-row__winner':''}">${esc(name(m.p1))}</span>
    ${score}
    <span class="match-row__side match-row__side--right ${w2?'match-row__winner':''}">${esc(name(m.p2))}</span>
    ${tag}
  </div>`;
}

/* ---------- Todos os jogos ---------- */
function renderAllTab(){
  if(!pubState.settings || !pubState.settings.groups_drawn){
    return `<div class="empty-state"><div class="empty-state__icon">📋</div><h3>Cronograma ainda não disponível</h3></div>`;
  }
  let html = '';
  GROUP_LETTERS.forEach(letter=>{
    const matches = pubState.groupMatches.filter(m=>m.group_letter===letter).sort((a,b)=>(a.order_index??0)-(b.order_index??0));
    if(!matches.length) return;
    html += `<div class="allmatches-group"><div class="allmatches-group__title">Grupo ${letter}</div>${matches.map(renderSlotPublic).join('')}</div>`;
  });
  ['r16','qf','sf','third','final'].forEach(round=>{
    const matches = pubState.koMatches.filter(m=>m.round===round).sort((a,b)=>(a.match_index??0)-(b.match_index??0));
    if(!matches.length) return;
    html += `<div class="allmatches-group"><div class="allmatches-group__title">${roundLabel(round)}</div>${matches.map(renderSlotPublic).join('')}</div>`;
  });
  return html || `<div class="empty-state"><h3>Nenhum jogo agendado ainda</h3></div>`;
}

function renderSlotPublic(m){
  const statusText = m.status==='done' ? `${m.score1} × ${m.score2}` : m.status==='live' ? 'AO VIVO' : formatTime(m.scheduled_time);
  return `<div class="slot">
    <span class="slot__time">${statusText}</span>
    <span class="slot__station">PS5 #${m.station ?? '-'}</span>
    <span class="slot__body">${esc(name(m.p1))} <span style="color:var(--muted-2)">vs</span> ${esc(name(m.p2))}</span>
    ${m.status==='live' ? '<span class="livedot"></span>' : ''}
  </div>`;
}

/* ---------- Realtime + animações ---------- */
async function handleRealtimeChange(table, payload){
  const oldRow = payload.old, newRow = payload.new;

  if((table==='group_matches' || table==='knockout_matches') && payload.eventType==='UPDATE' && oldRow && newRow){
    if((newRow.score1 ?? 0) > (oldRow.score1 ?? 0)) playGoalFlash(name(newRow.p1));
    else if((newRow.score2 ?? 0) > (oldRow.score2 ?? 0)) playGoalFlash(name(newRow.p2));

    if(table==='knockout_matches' && oldRow.status!=='done' && newRow.status==='done' && (newRow.round==='sf' || newRow.round==='final')){
      const winnerId = newRow.score1 > newRow.score2 ? newRow.p1 : newRow.p2;
      playWinnerReveal(name(winnerId), roundLabel(newRow.round));
    }
  }

  if(table==='tournament_state' && oldRow && newRow && oldRow.phase!=='finished' && newRow.phase==='finished'){
    const km = await fetchKnockoutMatches();
    const final = km.find(m=>m.round==='final');
    const third = km.find(m=>m.round==='third');
    const champion = final ? name(final.score1>final.score2?final.p1:final.p2) : null;
    const runnerUp = final ? name(final.score1>final.score2?final.p2:final.p1) : null;
    const thirdName = third ? name(third.score1>third.score2?third.p1:third.p2) : null;
    setTimeout(()=> playPodium(champion, runnerUp, thirdName), 5200);
  }

  await loadAll();
}

document.getElementById('pubTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.pub-tab');
  if(!btn) return;
  activeTab = btn.dataset.tab;
  renderActiveTab();
});

function tickClock(){
  const el = document.getElementById('pubClock');
  if(el) el.textContent = '🕐 ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

(function initPublic(){
  tickClock();
  clockTimer2 = setInterval(tickClock, 15000);
  loadAll();
  subscribeRealtime(handleRealtimeChange);
})();
