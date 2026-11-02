const { forwardTaskRequest } = require('../../lib/task-api.cjs')

module.exports = async function taskHandler(req, res) {
  if (req.method !== 'GET') return res.setHeader('Allow', 'GET').status(405).json({ error: 'Method not allowed.' })
  return forwardTaskRequest(req, res, { code: req.query.code })
}

module.exports.config = { api: { bodyParser: { sizeLimit: '4mb' } } }
