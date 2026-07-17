// ============================================================
// HANGAR WORLD — CAMPEONATO FC26
// api/_lib/tournament.js — regras de negócio usadas pelas rotas /api/admin/*
// Este arquivo fala direto com o Supabase (service role) e faz os
// cálculos de sorteio, classificação, avanço no mata-mata e substituições.
// ============================================================

const { recomputeSchedule, assignStationsAndOrder } = require('../../js/schedule-logic.js');

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H'];

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

async function getSettings(supabase){
  const { data, error } = await supabase.from('tournament_state').select('*').eq('id',1).single();
  if(error) throw error;
  return data;
}

async function getAllMatchesForSchedule(supabase){
  const [{data: gm, error: e1}, {data: km, error: e2}] = await Promise.all([
    supabase.from('group_matches').select('*'),
    supabase.from('knockout_matches').select('*'),
  ]);
  if(e1) throw e1; if(e2) throw e2;
  const groupItems = gm.map(m=>({...m, phase:'group'}));
  const koItems = km.map(m=>({...m, phase:m.round}));
  return { groupItems, koItems, all: [...groupItems, ...koItems] };
}

async function recomputeAndPersistSchedule(supabase){
  const settings = await getSettings(supabase);
  if(!settings.tournament_started) return;
  const { groupItems, koItems, all } = await getAllMatchesForSchedule(supabase);
  const updates = recomputeSchedule(all, settings, settings.started_at);
  if(!updates.length) return;

  const groupIds = new Set(groupItems.map(m=>m.id));
  const groupUpdates = updates.filter(u=>groupIds.has(u.id));
  const koUpdates = updates.filter(u=>!groupIds.has(u.id));

  await Promise.all([
    ...groupUpdates.map(u=> supabase.from('group_matches').update({scheduled_time:u.scheduled_time}).eq('id',u.id)),
    ...koUpdates.map(u=> supabase.from('knockout_matches').update({scheduled_time:u.scheduled_time}).eq('id',u.id)),
  ]);
}

/* ---------------- Jogadores ---------------- */
async function addPlayer(supabase, name){
  name = (name||'').trim();
  if(!name) return {ok:false, msg:'Nome não pode ser vazio.'};
  const { data: existing } = await supabase.from('players').select('id').eq('is_active', true);
  if(existing && existing.length >= 32) return {ok:false, msg:'Limite de 32 jogadores atingido.'};
  const { error } = await supabase.from('players').insert({ name, is_active:true });
  if(error) return {ok:false, msg:error.message};
  return {ok:true};
}

async function removePlayer(supabase, id){
  const { data: state } = await supabase.from('tournament_state').select('groups_drawn').eq('id',1).single();
  if(state.groups_drawn) return {ok:false, msg:'Grupos já sorteados — use a substituição pela lista de espera.'};
  const { error } = await supabase.from('players').delete().eq('id', id);
  if(error) return {ok:false, msg:error.message};
  return {ok:true};
}

async function addWaitlist(supabase, name){
  name = (name||'').trim();
  if(!name) return {ok:false, msg:'Nome não pode ser vazio.'};
  const { error } = await supabase.from('waitlist').insert({ name });
  if(error) return {ok:false, msg:error.message};
  return {ok:true};
}

/**
 * Substitui um jogador titular por alguém da lista de espera.
 * Só atualiza as partidas que ainda NÃO foram jogadas (status = waiting).
 * Partidas já concluídas ou em andamento mantêm o nome de quem realmente jogou.
 */
async function substitutePlayer(supabase, oldPlayerId, waitlistId){
  const [{data: oldPlayer}, {data: waitlistEntry}] = await Promise.all([
    supabase.from('players').select('*').eq('id', oldPlayerId).single(),
    supabase.from('waitlist').select('*').eq('id', waitlistId).single(),
  ]);
  if(!oldPlayer) return {ok:false, msg:'Jogador não encontrado.'};
  if(!waitlistEntry || waitlistEntry.used) return {ok:false, msg:'Substituto inválido ou já utilizado.'};

  const { data: newPlayer, error: insErr } = await supabase.from('players')
    .insert({ name: waitlistEntry.name, group_letter: oldPlayer.group_letter, is_active:true })
    .select().single();
  if(insErr) return {ok:false, msg:insErr.message};

  await supabase.from('players').update({ is_active:false }).eq('id', oldPlayerId);
  await supabase.from('waitlist').update({ used:true, used_for_player_id:newPlayer.id }).eq('id', waitlistId);

  // troca o jogador nas partidas de grupo AINDA NÃO jogadas
  await supabase.from('group_matches').update({ p1: newPlayer.id }).eq('p1', oldPlayerId).eq('status','waiting');
  await supabase.from('group_matches').update({ p2: newPlayer.id }).eq('p2', oldPlayerId).eq('status','waiting');
  // e nas partidas de mata-mata ainda não jogadas, se já existirem
  await supabase.from('knockout_matches').update({ p1: newPlayer.id }).eq('p1', oldPlayerId).eq('status','waiting');
  await supabase.from('knockout_matches').update({ p2: newPlayer.id }).eq('p2', oldPlayerId).eq('status','waiting');

  return {ok:true, newPlayerId:newPlayer.id};
}

/* ---------------- Sorteio de grupos ---------------- */
async function drawGroups(supabase){
  const { data: players } = await supabase.from('players').select('*').eq('is_active', true);
  if(!players || players.length !== 32){
    return {ok:false, msg:`É necessário ter exatamente 32 jogadores ativos (atual: ${players ? players.length : 0}).`};
  }
  const shuffled = shuffle(players);
  const groupOf = {};
  GROUP_LETTERS.forEach((letter, idx)=>{
    shuffled.slice(idx*4, idx*4+4).forEach(p=> groupOf[p.id] = letter);
  });

  await Promise.all(Object.entries(groupOf).map(([playerId, letter])=>
    supabase.from('players').update({ group_letter: letter }).eq('id', playerId)
  ));

  let matches = [];
  let order = 0;
  GROUP_LETTERS.forEach(letter=>{
    const ids = Object.keys(groupOf).filter(id=>groupOf[id]===letter);
    const [a,b,c,d] = shuffle(ids);
    const pairs = [[a,b],[c,d],[a,c],[b,d]];
    pairs.forEach(([p1,p2])=>{
      matches.push({ group_letter: letter, p1, p2, status:'waiting', order_index: order++ });
    });
  });

  const { data: settings } = await supabase.from('tournament_state').select('stations').eq('id',1).single();
  matches = assignStationsAndOrder(matches, settings.stations || 2, 0).map(m=>({...m, order_index:m.order_index}));

  const { error } = await supabase.from('group_matches').insert(matches);
  if(error) return {ok:false, msg:error.message};

  await supabase.from('tournament_state').update({ groups_drawn:true, phase:'groups' }).eq('id',1);
  return {ok:true};
}

/* ---------------- Classificação ---------------- */
function computeStandingsFor(groupLetter, players, matches){
  const ids = players.filter(p=>p.group_letter===groupLetter).map(p=>p.id);
  const table = {};
  ids.forEach(id=> table[id] = {id, pts:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,played:0});

  matches.filter(m=>m.group_letter===groupLetter && m.status==='done').forEach(m=>{
    const t1=table[m.p1], t2=table[m.p2];
    if(!t1||!t2) return;
    t1.gf+=m.score1; t1.ga+=m.score2; t2.gf+=m.score2; t2.ga+=m.score1;
    t1.played++; t2.played++;
    if(m.score1>m.score2){ t1.w++; t1.pts+=3; t2.l++; }
    else if(m.score1<m.score2){ t2.w++; t2.pts+=3; t1.l++; }
    else { t1.d++; t2.d++; t1.pts+=1; t2.pts+=1; }
  });
  Object.values(table).forEach(t=> t.gd = t.gf - t.ga);

  function h2h(id1,id2){
    const m = matches.find(mm=>mm.group_letter===groupLetter && mm.status==='done' &&
      ((mm.p1===id1&&mm.p2===id2)||(mm.p1===id2&&mm.p2===id1)));
    if(!m) return 0;
    const s1 = m.p1===id1?m.score1:m.score2;
    const s2 = m.p1===id1?m.score2:m.score1;
    return s1-s2;
  }

  return Object.values(table).sort((a,b)=>{
    if(b.pts!==a.pts) return b.pts-a.pts;
    if(b.gd!==a.gd) return b.gd-a.gd;
    if(b.gf!==a.gf) return b.gf-a.gf;
    const h = h2h(a.id,b.id);
    if(h!==0) return -h;
    return 0;
  });
}

function allGroupsComplete(matches){
  return GROUP_LETTERS.every(letter=>{
    const gm = matches.filter(m=>m.group_letter===letter);
    return gm.length===4 && gm.every(m=>m.status==='done');
  });
}

/* ---------------- Mata-mata ---------------- */
async function generateKnockoutBracket(supabase){
  const [{data: players}, {data: matches}, {data: settings}] = await Promise.all([
    supabase.from('players').select('*'),
    supabase.from('group_matches').select('*'),
    supabase.from('tournament_state').select('*').eq('id',1).single(),
  ]);
  if(!allGroupsComplete(matches)) return {ok:false, msg:'Finalize todas as partidas de grupo antes de gerar o mata-mata.'};

  const qualified = {};
  GROUP_LETTERS.forEach(letter=>{
    const st = computeStandingsFor(letter, players, matches);
    qualified[letter] = [st[0].id, st[1].id];
  });

  const pairs = [
    [qualified.A[0], qualified.B[1]], [qualified.C[0], qualified.D[1]],
    [qualified.E[0], qualified.F[1]], [qualified.G[0], qualified.H[1]],
    [qualified.B[0], qualified.A[1]], [qualified.D[0], qualified.C[1]],
    [qualified.F[0], qualified.E[1]], [qualified.H[0], qualified.G[1]],
  ];

  const r16 = pairs.map(([p1,p2], i)=>({ round:'r16', match_index:i, p1, p2, status:'waiting',
    next_round:'qf', next_match_index: Math.floor(i/2), next_slot: i%2===0?'p1':'p2' }));
  const qf = Array.from({length:4},(_,i)=>({ round:'qf', match_index:i, p1:null, p2:null, status:'waiting',
    next_round:'sf', next_match_index: Math.floor(i/2), next_slot: i%2===0?'p1':'p2' }));
  const sf = Array.from({length:2},(_,i)=>({ round:'sf', match_index:i, p1:null, p2:null, status:'waiting',
    next_round:'final', next_match_index:0, next_slot: i%2===0?'p1':'p2' }));
  const final = [{ round:'final', match_index:0, p1:null, p2:null, status:'waiting', next_round:null, next_match_index:null, next_slot:null }];

  let all = [...r16, ...qf, ...sf, ...final];
  const lastOrder = Math.max(0, ...matches.map(m=>m.order_index ?? 0));
  all = assignStationsAndOrder(all, settings.stations || 2, lastOrder + 1);

  const { error } = await supabase.from('knockout_matches').insert(all);
  if(error) return {ok:false, msg:error.message};

  await supabase.from('tournament_state').update({ knockout_generated:true, phase:'knockout' }).eq('id',1);
  await recomputeAndPersistSchedule(supabase);
  return {ok:true};
}

/** Gera a partida de 3º lugar assim que as duas semifinais estiverem concluídas. */
async function maybeGenerateThirdPlace(supabase){
  const [{data: settings}, {data: sfMatches}] = await Promise.all([
    supabase.from('tournament_state').select('*').eq('id',1).single(),
    supabase.from('knockout_matches').select('*').eq('round','sf'),
  ]);
  if(settings.third_place_generated) return;
  if(!sfMatches || sfMatches.length !== 2 || !sfMatches.every(m=>m.status==='done')) return;

  const losers = sfMatches.map(m=> m.score1 > m.score2 ? m.p2 : m.p1);
  const { data: allMatches } = await supabase.from('knockout_matches').select('order_index');
  const lastOrder = Math.max(0, ...allMatches.map(m=>m.order_index ?? 0));
  const [third] = assignStationsAndOrder(
    [{ round:'third', match_index:0, p1:losers[0], p2:losers[1], status:'waiting', next_round:null, next_match_index:null, next_slot:null }],
    settings.stations || 2, lastOrder + 1
  );
  await supabase.from('knockout_matches').insert(third);
  await supabase.from('tournament_state').update({ third_place_generated:true }).eq('id',1);
  await recomputeAndPersistSchedule(supabase);
}

async function advanceKnockoutWinner(supabase, match){
  if(match.round === 'sf'){
    await maybeGenerateThirdPlace(supabase);
  }
  if(match.round === 'final'){
    await supabase.from('tournament_state').update({ phase:'finished' }).eq('id',1);
  }
  if(!match.next_round) return; // final ou terceiro lugar: não avança ninguém
  const winner = match.score1 > match.score2 ? match.p1 : match.p2;
  const { data: nextMatch } = await supabase.from('knockout_matches')
    .select('id').eq('round', match.next_round).eq('match_index', match.next_match_index).single();
  if(!nextMatch) return;
  await supabase.from('knockout_matches').update({ [match.next_slot]: winner }).eq('id', nextMatch.id);
}

/* ---------------- Cronograma / início do evento ---------------- */
async function startTournament(supabase){
  const { data: settings } = await supabase.from('tournament_state').select('*').eq('id',1).single();
  if(!settings.groups_drawn) return {ok:false, msg:'Sorteie os grupos antes de começar o campeonato.'};
  if(settings.tournament_started) return {ok:false, msg:'O campeonato já foi iniciado.'};
  const startedAt = new Date().toISOString();
  await supabase.from('tournament_state').update({ tournament_started:true, started_at: startedAt }).eq('id',1);
  await recomputeAndPersistSchedule(supabase);
  return {ok:true};
}

/* ---------------- Ciclo de vida de uma partida ---------------- */
function tableFor(source){ return source === 'group' ? 'group_matches' : 'knockout_matches'; }

async function startMatch(supabase, id, source){
  const { error } = await supabase.from(tableFor(source))
    .update({ status:'live', score1:0, score2:0, started_at: new Date().toISOString() })
    .eq('id', id);
  if(error) return {ok:false, msg:error.message};
  return {ok:true};
}

async function updateLiveScore(supabase, id, source, side, delta){
  const table = tableFor(source);
  const { data: m } = await supabase.from(table).select('score1,score2').eq('id', id).single();
  if(!m) return {ok:false, msg:'Partida não encontrada.'};
  const col = side === 1 ? 'score1' : 'score2';
  const next = Math.max(0, (m[col] ?? 0) + delta);
  const { error } = await supabase.from(table).update({ [col]: next }).eq('id', id);
  if(error) return {ok:false, msg:error.message};
  return {ok:true, value: next};
}

async function finishMatch(supabase, id, source, score1, score2){
  const table = tableFor(source);
  if(source !== 'group' && score1 === score2){
    return {ok:false, msg:'Mata-mata não pode terminar empatado — registre o placar após prorrogação/pênaltis.'};
  }
  const { data: m, error: fetchErr } = await supabase.from(table).select('*').eq('id', id).single();
  if(fetchErr || !m) return {ok:false, msg:'Partida não encontrada.'};

  const { error } = await supabase.from(table)
    .update({ status:'done', score1, score2, wo:null, finished_at: new Date().toISOString() })
    .eq('id', id);
  if(error) return {ok:false, msg:error.message};

  if(source !== 'group'){
    await advanceKnockoutWinner(supabase, { ...m, score1, score2 });
  }
  await recomputeAndPersistSchedule(supabase);
  return {ok:true};
}

async function registerWO(supabase, id, source, winnerSide){
  const table = tableFor(source);
  const { data: m, error: fetchErr } = await supabase.from(table).select('*').eq('id', id).single();
  if(fetchErr || !m) return {ok:false, msg:'Partida não encontrada.'};

  const score1 = winnerSide === 1 ? 2 : 0;
  const score2 = winnerSide === 1 ? 0 : 2;
  const wo = winnerSide === 1 ? 'p1' : 'p2';

  const { error } = await supabase.from(table)
    .update({ status:'done', score1, score2, wo, finished_at: new Date().toISOString() })
    .eq('id', id);
  if(error) return {ok:false, msg:error.message};

  if(source !== 'group'){
    await advanceKnockoutWinner(supabase, { ...m, score1, score2 });
  }
  await recomputeAndPersistSchedule(supabase);
  return {ok:true};
}

async function editFinishedMatch(supabase, id, source, score1, score2){
  const table = tableFor(source);
  const { data: m, error: fetchErr } = await supabase.from(table).select('*').eq('id', id).single();
  if(fetchErr || !m) return {ok:false, msg:'Partida não encontrada.'};
  const { error } = await supabase.from(table).update({ score1, score2, wo:null }).eq('id', id);
  if(error) return {ok:false, msg:error.message};
  if(source !== 'group'){
    await advanceKnockoutWinner(supabase, { ...m, score1, score2 });
  }
  return {ok:true};
}

async function listWaitlist(supabase){
  const { data, error } = await supabase.from('waitlist').select('*').order('created_at');
  if(error) return {ok:false, msg:error.message};
  return {ok:true, data};
}

async function updateSettings(supabase, patch){
  const allowed = ['group_game_min','r16_game_min','qf_game_min','sf_game_min','third_game_min','final_game_min','transition_min','stations'];
  const clean = {};
  Object.keys(patch||{}).forEach(k=>{ if(allowed.includes(k)) clean[k] = patch[k]; });
  const { error } = await supabase.from('tournament_state').update(clean).eq('id',1);
  if(error) return {ok:false, msg:error.message};
  return {ok:true};
}

async function resetTournament(supabase){
  await supabase.from('group_matches').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await supabase.from('knockout_matches').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await supabase.from('players').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await supabase.from('waitlist').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await supabase.from('tournament_state').update({
    phase:'setup', groups_drawn:false, knockout_generated:false, third_place_generated:false,
    tournament_started:false, started_at:null,
  }).eq('id',1);
  return {ok:true};
}

module.exports = {
  GROUP_LETTERS, addPlayer, removePlayer, addWaitlist, substitutePlayer, drawGroups,
  computeStandingsFor, allGroupsComplete, generateKnockoutBracket, advanceKnockoutWinner,
  maybeGenerateThirdPlace, startTournament, recomputeAndPersistSchedule, getSettings,
  startMatch, updateLiveScore, finishMatch, registerWO, editFinishedMatch, updateSettings, resetTournament, listWaitlist,
};
