// api/admin/session.js
const { requireAdmin } = require('../_lib/auth.js');

module.exports = async (req, res) => {
  if(!requireAdmin(req, res)) return; // já responde 401 se inválido
  return res.status(200).json({ ok:true });
};
