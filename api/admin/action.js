// api/admin/action.js
// Rota única para todas as escritas do organizador. Exige sessão válida
// (cookie assinado) e usa a service role key do Supabase por baixo dos panos.

const { requireAdmin } = require('../_lib/auth.js');
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin.js');
const T = require('../_lib/tournament.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST'){
    return res.status(405).json({ ok:false, error:'Método não permitido.' });
  }
  if(!requireAdmin(req, res)) return;

  const { action, payload } = req.body || {};
  const supabase = getSupabaseAdmin();

  try{
    let result;
    switch(action){
      case 'addPlayer':
        result = await T.addPlayer(supabase, payload.name); break;
      case 'addPlayersBulk': {
        const names = String(payload.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
        let added=0, skipped=0;
        for(const n of names){
          const r = await T.addPlayer(supabase, n);
          if(r.ok) added++; else skipped++;
        }
        result = {ok:true, added, skipped};
        break;
      }
      case 'removePlayer':
        result = await T.removePlayer(supabase, payload.id); break;
      case 'listWaitlist':
        result = await T.listWaitlist(supabase); break;
      case 'addWaitlist':
        result = await T.addWaitlist(supabase, payload.name); break;
      case 'substitutePlayer':
        result = await T.substitutePlayer(supabase, payload.oldPlayerId, payload.waitlistId); break;
      case 'drawGroups':
        result = await T.drawGroups(supabase); break;
      case 'startTournament':
        result = await T.startTournament(supabase); break;
      case 'generateBracket':
        result = await T.generateKnockoutBracket(supabase); break;
      case 'startMatch':
        result = await T.startMatch(supabase, payload.id, payload.source); break;
      case 'updateLiveScore':
        result = await T.updateLiveScore(supabase, payload.id, payload.source, payload.side, payload.delta); break;
      case 'finishMatch':
        result = await T.finishMatch(supabase, payload.id, payload.source, payload.score1, payload.score2); break;
      case 'registerWO':
        result = await T.registerWO(supabase, payload.id, payload.source, payload.winnerSide); break;
      case 'editMatch':
        result = await T.editFinishedMatch(supabase, payload.id, payload.source, payload.score1, payload.score2); break;
      case 'updateSettings':
        result = await T.updateSettings(supabase, payload); break;
      case 'resetTournament':
        result = await T.resetTournament(supabase); break;
      default:
        return res.status(400).json({ ok:false, error:'Ação desconhecida: ' + action });
    }
    return res.status(result.ok ? 200 : 400).json(result);
  }catch(err){
    console.error('Erro na ação', action, err);
    return res.status(500).json({ ok:false, error: err.message || 'Erro interno.' });
  }
};
