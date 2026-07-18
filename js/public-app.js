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

  return `
      <div>
        <div class="stations-row">${cards}</div>
        
        <div class="esconder-no-celular" style="display: flex; align-items: center; justify-content: space-between; margin-top: 220px; padding: 30px clamp(16px, 4vw, 40px); background: linear-gradient(to top, rgba(18,25,35,0.9) 0%, transparent 100%); border-top: 1px solid rgba(41,51,63,0.2); border-radius: var(--radius); gap: 40px;">
          
          <div style="display: flex; flex-direction: column; gap: 8px; text-align: left;">
            <h4 style="font-family: var(--font-display); color: var(--amber-bright); text-transform: uppercase; font-size: 26px; margin: 0; letter-spacing: 0.04em;">ACOMPANHE NO SEU CELULAR</h4>
            <p style="color: var(--muted); font-size: 16px; margin: 0; font-weight: 500; line-height: 1.4;">Escaneie o QR Code ao lado para conferir os <strong style="color: var(--white);">Grupos</strong>, <strong style="color: var(--white);">Classificação</strong><br>e o <strong style="color: var(--white);">Horário dos próximos jogos</strong> em tempo real!</p>
          </div>

          <div style="display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
            <img src="assets/qrcode.png" alt="Acesse o site" style="width: 240px; height: 240px; border: 6px solid var(--white); border-radius: 12px; filter: drop-shadow(0 0 25px rgba(255,176,32,0.25));" />
          </div>

        </div>

        <div class="esconder-na-tv">
          <div style="height: 1px; background: var(--line); margin: 40px 0 20px 0; opacity: 0.5;"></div>
          <div style="display: flex; justify-content: center; padding: 0 10px; margin-bottom: 30px;">
            ${renderStoreAdsCard()}
          </div>
        </div>
      </div>
    `;
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


// Função para renderizar o Card de Propaganda da Loja com as tuas condições
function renderStoreAdsCard() {
  return `
    <div class="live-station card-propaganda" style="border: 1px dashed var(--amber); background: linear-gradient(135deg, var(--panel) 60%, rgba(255,176,32,0.05) 100%); padding: 16px; border-radius: var(--radius); display: flex; flex-direction: column;">
      <div class="live-station__head" style="border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-family: var(--font-display); color: var(--amber-bright); font-size: 18px; margin: 0; text-transform: uppercase;">NOSSOS PLANOS</h3>
        <span class="live-station__badge" style="background: var(--amber); color: var(--void); font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;">PROMO HANGAR</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
        <div style="padding-left: 8px; border-left: 2px solid var(--muted-2);">
          <strong style="color: var(--white); font-weight: 600;">Estação Avulsa:</strong>
          <div style="color: var(--muted); margin-top: 2px;">Jogue em qualquer estação de R$ 25 a R$ 40 a hora.</div>
        </div>

        <div style="padding-left: 8px; border-left: 2px solid var(--teal);">
          <strong style="color: var(--teal); font-weight: 600;">Cartão da Loja (R$ 9,90/h):</strong>
          <div style="color: var(--muted); margin-top: 2px;">Adquira o cartão por R$ 99,90 (inclui 10 créditos de 1h). <span style="font-size: 10px; color: var(--amber-dim);">*Consulte condições</span></div>
        </div>

        <div style="padding-left: 8px; border-left: 2px solid var(--amber); background: rgba(255,176,32,0.03); padding: 6px 8px; border-radius: var(--radius);">
          <strong style="color: var(--amber-bright); text-transform: uppercase; letter-spacing: 0.05em;">🔥 NOVIDADE: HANGAR PASS</strong>
          <div style="color: var(--white); margin-top: 2px; font-weight: 600; font-size: 15px;">R$ 119,90 / mês</div>
          <div style="color: var(--muted); font-size: 12px; margin-top: 2px;">15 horas mensais para usar em qualquer PC, PS5 ou Simulador (VR não incluso).</div>
          <div style="font-size: 10px; color: var(--muted-2); margin-top: 4px;">Fidelidade mínima de 3 meses (2 meses restantes no boleto).</div>
        </div>
      </div>
    </div>
  `;
}