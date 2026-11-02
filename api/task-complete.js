const { forwardTaskRequest } = require('../lib/task-api.cjs')

module.exports = async function completeTaskHandler(req, res) {
  if (req.method !== 'POST') return res.setHeader('Allow', 'POST').status(405).json({ error: 'Method not allowed.' })
  return forwardTaskRequest(req, res, { code: req.query.code, action: '/complete', method: 'POST' })
}

module.exports.config = { api: { bodyParser: { sizeLimit: '4mb' } } }
