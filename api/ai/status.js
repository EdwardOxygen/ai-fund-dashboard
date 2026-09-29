module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ provider: 'local', minimax_configured: false, minimax_base_url: '', minimax_model: 'rule-template', minimax_protocol: 'anthropic', runtime_configured: false });
};
