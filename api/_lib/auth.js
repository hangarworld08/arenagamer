// ============================================================
// HANGAR WORLD — CAMPEONATO FC26
// api/_lib/auth.js — sessão simples do organizador (assinada por HMAC)
//
// Não usamos Supabase Auth aqui de propósito: é uma senha única
// compartilhada (como o organizador pediu), mas agora validada e
// assinada no servidor — o front-end nunca vê o PIN nem o segredo.
// ============================================================

const crypto = require('crypto');

const COOKIE_NAME = 'hangar_admin';
const SESSION_HOURS = 12;

function getSecret(){
  const secret = process.env.ADMIN_SESSION_SECRET;
  if(!secret) throw new Error('ADMIN_SESSION_SECRET não configurado nas variáveis de ambiente.');
  return secret;
}

function sign(payload){
  const secret = getSecret();
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createSessionToken(){
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function isValidSessionToken(token){
  if(!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if(!payload || !sig) return false;
  const expected = sign(payload);
  // comparação em tempo constante
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if(a.length !== b.length) return false;
  if(!crypto.timingSafeEqual(a, b)) return false;
  return Number(payload) > Date.now();
}

function parseCookies(req){
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map(pair=>{
      const idx = pair.indexOf('=');
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx+1).trim());
      return [k, v];
    })
  );
}

function requireAdmin(req, res){
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if(!isValidSessionToken(token)){
    res.status(401).json({ ok:false, error:'Não autenticado. Faça login em /adm.' });
    return false;
  }
  return true;
}

function setSessionCookie(res, token){
  const maxAge = SESSION_HOURS * 60 * 60;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(res){
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

module.exports = { requireAdmin, createSessionToken, setSessionCookie, clearSessionCookie, parseCookies, isValidSessionToken };
