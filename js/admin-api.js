/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   js/admin-api.js — chamadas HTTP para /api/admin/*
   ============================================================ */

async function adminLogin(pin){
  const res = await fetch('/api/admin/login', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin}),
  });
  return res.json();
}
async function adminLogout(){
  const res = await fetch('/api/admin/logout', { method:'POST' });
  return res.json();
}
async function adminCheckSession(){
  const res = await fetch('/api/admin/session');
  return res.ok;
}
async function adminAction(action, payload){
  const res = await fetch('/api/admin/action', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action, payload}),
  });
  const json = await res.json();
  if(res.status === 401){
    // sessão expirou — manda de volta pra tela de login
    showToast('Sessão expirada. Faça login novamente.');
    showAdminLogin();
  }
  return json;
}
