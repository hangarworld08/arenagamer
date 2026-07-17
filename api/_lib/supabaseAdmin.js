// ============================================================
// HANGAR WORLD — CAMPEONATO FC26
// api/_lib/supabaseAdmin.js — cliente Supabase com a service role key
//
// Só é usado dentro das funções serverless (nunca no navegador).
// A service role key ignora RLS, por isso ela é o que dá poder de
// escrita real ao painel do organizador.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSupabaseAdmin(){
  if(client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key){
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados nas variáveis de ambiente.');
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

module.exports = { getSupabaseAdmin };
