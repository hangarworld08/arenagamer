/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   schedule-logic.js — cronograma reativo (puro, sem I/O)

   Regra: cada estação (PS5) tem sua própria fila. O horário de
   início de uma partida = horário real de término da partida
   anterior naquela estação (ou estimado, se ainda não terminou)
   + tempo de transição. Duração de jogo varia por fase.

   Este arquivo funciona tanto no navegador (via <script>) quanto
   no Node (funções serverless da Vercel), por isso usa o padrão
   module.exports / window no final.
   ============================================================ */

const PHASE_DURATION_KEY = {
  group: 'group_game_min',
  r16: 'r16_game_min',
  qf: 'qf_game_min',
  sf: 'sf_game_min',
  third: 'third_game_min',
  final: 'final_game_min',
};

function gameDurationMs(phase, settings){
  const key = PHASE_DURATION_KEY[phase] || 'group_game_min';
  const minutes = settings[key] ?? 5;
  return minutes * 60000;
}
function transitionMs(settings){
  return (settings.transition_min ?? 3) * 60000;
}

/**
 * Recalcula scheduled_time de todas as partidas "waiting" e "live"
 * de todas as estações, a partir do estado real (started_at/finished_at)
 * das partidas já em andamento ou concluídas.
 *
 * @param {Array} matches - lista de partidas (group_matches + knockout_matches),
 *   cada uma com: {id, phase, station, order_index, status, started_at, finished_at, scheduled_time}
 *   `phase` deve ser um dos: group | r16 | qf | sf | third | final
 * @param {Object} settings - tournament_state (durações + transition_min)
 * @param {Date|number} tournamentStartedAt - quando o botão "Começar campeonato" foi clicado
 * @returns {Array} lista de {id, scheduled_time} apenas para as partidas cujo
 *   horário precisa ser atualizado (waiting matches ainda não iniciadas)
 */
function recomputeSchedule(matches, settings, tournamentStartedAt){
  if(!tournamentStartedAt) return [];

  const byStation = {};
  matches.forEach(m=>{
    const st = m.station || 1;
    if(!byStation[st]) byStation[st] = [];
    byStation[st].push(m);
  });

  const updates = [];
  const startMs = new Date(tournamentStartedAt).getTime();

  Object.keys(byStation).forEach(stationKey=>{
    const queue = byStation[stationKey]
      .slice()
      .sort((a,b)=> (a.order_index ?? 0) - (b.order_index ?? 0));

    // cursor = próximo horário livre naquela estação
    let cursor = startMs + transitionMs(settings);

    queue.forEach(m=>{
      if(m.status === 'done'){
        // partida já terminou de verdade: a próxima libera a partir do horário real + transição
        const endMs = m.finished_at ? new Date(m.finished_at).getTime() : cursor;
        cursor = endMs + transitionMs(settings);
      } else if(m.status === 'live'){
        // já começou: usamos o fim estimado (início real + duração da fase) como âncora
        const startedMs = m.started_at ? new Date(m.started_at).getTime() : cursor;
        const estimatedEnd = startedMs + gameDurationMs(m.phase, settings);
        cursor = estimatedEnd + transitionMs(settings);
      } else {
        // waiting: agenda para o cursor atual e avança o cursor pela duração completa do slot
        const scheduled = cursor;
        updates.push({id: m.id, scheduled_time: new Date(scheduled).toISOString()});
        cursor = scheduled + gameDurationMs(m.phase, settings) + transitionMs(settings);
      }
    });
  });

  return updates;
}

/**
 * Atribui estações (round-robin) e order_index sequencial a uma lista de
 * partidas recém-criadas (usado ao sortear grupos ou gerar o mata-mata).
 * `startOrderIndex` permite continuar a numeração após partidas já existentes.
 */
function assignStationsAndOrder(newMatches, stations, startOrderIndex){
  return newMatches.map((m, i)=>({
    ...m,
    station: (i % stations) + 1,
    order_index: startOrderIndex + i,
  }));
}

function estimateFinishTime(matches, settings, tournamentStartedAt){
  const updates = recomputeSchedule(
    matches.map(m=> m.status==='done' || m.status==='live' ? m : {...m}),
    settings, tournamentStartedAt
  );
  if(!updates.length){
    // tudo concluído: acha o maior finished_at
    const finished = matches.filter(m=>m.finished_at).map(m=>new Date(m.finished_at).getTime());
    return finished.length ? new Date(Math.max(...finished)) : null;
  }
  const last = updates[updates.length-1];
  const lastMatch = matches.find(m=>m.id===last.id);
  const endMs = new Date(last.scheduled_time).getTime() + gameDurationMs(lastMatch.phase, settings);
  return new Date(endMs);
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { recomputeSchedule, assignStationsAndOrder, gameDurationMs, transitionMs, estimateFinishTime };
}
if(typeof window !== 'undefined'){
  window.ScheduleLogic = { recomputeSchedule, assignStationsAndOrder, gameDurationMs, transitionMs, estimateFinishTime };
}
