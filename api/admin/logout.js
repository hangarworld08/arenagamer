// api/admin/logout.js
const { clearSessionCookie } = require('../_lib/auth.js');

module.exports = async (req, res) => {
  clearSessionCookie(res);
  return res.status(200).json({ ok:true });
};
