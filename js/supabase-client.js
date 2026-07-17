/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   js/supabase-client.js — cliente do navegador (chave anônima) +
   helpers de leitura e inscrição em tempo real.
   Depende do script https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
   estar carregado ANTES deste arquivo (expõe window.supabase).
   ============================================================ */

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

async function fetchTournamentState(){
  const { data, error } = await sb.from('tournament_state').select('*').eq('id',1).single();
  if(error){ console.error(error); return null; }
  return data;
}
async function fetchPlayers(){
  const { data, error } = await sb.from('players').select('*');
  if(error){ console.error(error); return []; }
  return data;
}
async function fetchGroupMatches(){
  const { data, error } = await sb.from('group_matches').select('*').order('order_index');
  if(error){ console.error(error); return []; }
  return data;
}
async function fetchKnockoutMatches(){
  const { data, error } = await sb.from('knockout_matches').select('*').order('order_index');
  if(error){ console.error(error); return []; }
  return data;
}

/**
 * Inscreve em mudanças nas 4 tabelas relevantes e chama `onChange(table, payload)`
 * sempre que algo mudar. Devolve a subscription (chame .unsubscribe() se precisar).
 */
function subscribeRealtime(onChange){
  const channel = sb.channel('hangar-realtime')
    .on('postgres_changes', { event:'*', schema:'public', table:'tournament_state' }, p=>onChange('tournament_state', p))
    .on('postgres_changes', { event:'*', schema:'public', table:'players' }, p=>onChange('players', p))
    .on('postgres_changes', { event:'*', schema:'public', table:'group_matches' }, p=>onChange('group_matches', p))
    .on('postgres_changes', { event:'*', schema:'public', table:'knockout_matches' }, p=>onChange('knockout_matches', p))
    .subscribe();
  return channel;
}
