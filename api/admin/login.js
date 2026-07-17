// api/admin/login.js
const { createSessionToken, setSessionCookie } = require('../_lib/auth.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST'){
    return res.status(405).json({ ok:false, error:'Método não permitido.' });
  }
  const { pin } = req.body || {};
  const expected = process.env.ADMIN_PIN;
  if(!expected){
    return res.status(500).json({ ok:false, error:'ADMIN_PIN não configurado no servidor.' });
  }
  if(!pin || pin !== expected){
    return res.status(401).json({ ok:false, error:'PIN incorreto.' });
  }
  const token = createSessionToken();
  setSessionCookie(res, token);
  return res.status(200).json({ ok:true });
};
