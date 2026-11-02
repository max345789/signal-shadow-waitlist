const TASK_CODE = /^\d{6}$/
const PRIVATE_FIELD = /(?:email|password|token|secret|phone|authorization)/i

function removePrivateFields(value) {
  if (Array.isArray(value)) return value.map(removePrivateFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_FIELD.test(key))
    .map(([key, nested]) => [key, removePrivateFields(nested)]))
}

function reply(res, status, body) {
  return res.status(status).json(body)
}

async function authorizeStudioUser(req, res) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    reply(res, 503, { error: 'Studio authentication is not configured on this deployment.' })
    return false
  }
  if (!token) {
    reply(res, 401, { error: 'Sign in to access task records.' })
    return false
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      reply(res, 401, { error: 'Your session is expired. Sign in again.' })
      return false
    }
    return true
  } catch {
    reply(res, 502, { error: 'Could not verify your studio session.' })
    return false
  }
}

async function forwardTaskRequest(req, res, { code, action = '', method = 'GET' }) {
  if (!TASK_CODE.test(String(code || ''))) return reply(res, 400, { error: 'Task code must contain exactly six digits.' })
  if (!(await authorizeStudioUser(req, res))) return
  const apiOrigin = process.env.TASK_API_ORIGIN || 'https://mcp.dabcloud.in'
  let origin
  try { origin = new URL(apiOrigin) } catch { return reply(res, 500, { error: 'TASK_API_ORIGIN must be a valid HTTPS URL.' }) }
  if (origin.protocol !== 'https:') return reply(res, 500, { error: 'TASK_API_ORIGIN must use HTTPS.' })
  const target = new URL(`/api/tasks/${code}${action}`, origin)
  const headers = { Accept: 'application/json' }
  if (process.env.TASK_API_TOKEN) headers.Authorization = `Bearer ${process.env.TASK_API_TOKEN}`
  let body
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(req.body || {})
    if (Buffer.byteLength(body) > 4_000_000) return reply(res, 413, { error: 'Workflow and reference images exceed the 4 MB task submission limit. Reduce the number of attached images.' })
  }
  try {
    const response = await fetch(target, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(120000) })
    const text = await response.text()
    let data
    try { data = text ? JSON.parse(text) : {} } catch { data = { message: text.slice(0, 3000) } }
    return res.status(response.status).json(removePrivateFields(data))
  } catch (error) {
    return reply(res, 502, { error: error.message || 'Task API is unavailable.' })
  }
}

module.exports = { forwardTaskRequest, removePrivateFields }
