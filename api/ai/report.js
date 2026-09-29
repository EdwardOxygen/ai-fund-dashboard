module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(503).json({ error: '公开演示版未开放外部AI。请使用本地规则报告；生产接入需独立认证与服务端密钥。' });
};
