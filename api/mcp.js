const crypto = require('node:crypto')

const MCP_VERSION = '2025-11-25'
const TASK_CODE = /^\d{6}$/
const WORKFLOW = {
  name: 'DabCloud Movie Workflow',
  taskCodeFormat: 'six digits',
  order: ['start', 'brief', 'character_design', 'environment_design', 'storyboard', 'video_generation', 'final_output'],
  continuityRule: 'Treat the approved task brief as the source of truth. Preserve its script, dialogue, timing, character appearance, environment, and storyboard order. Do not invent or silently change instructions.',
  nodes: [
    { id: 'start', name: 'Production Start', instructions: 'Load the approved movie task by its six-digit task code. Keep the source task record pinned for every later node.', inputs: ['task_code'], outputs: ['task_record'] },
    { id: 'brief', name: 'MCP Brief & Script', instructions: 'Read the complete approved prompt, script, dialogue, character design, storyboard, environment, and duration from the task record. Preserve the source version and flag missing or conflicting instructions before generation.', inputs: ['task_record'], outputs: ['approved_brief', 'script', 'dialogue', 'duration'] },
    { id: 'character_design', name: 'Character Design', instructions: 'For each named character, use a seven-square reference sheet on a plain white background: four full-body standing views (front, left side, right side, back), plus three close-ups (front face, three-quarter face, back of head). Keep face, clothing, age, colors, and visual style consistent across every view and shot.', inputs: ['character_names', 'character_descriptions', 'character_reference_photos'], outputs: ['character_reference_sheets'] },
    { id: 'environment_design', name: 'Environment Design', instructions: 'Design the setting separately from the characters. Use the environment description and reference images to keep location, time of day, weather, lighting, colors, and set details consistent across shots.', inputs: ['environment_description', 'environment_reference_images'], outputs: ['environment_design'] },
    { id: 'storyboard', name: 'Storyboard', instructions: 'Translate the approved script and dialogue into ordered storyboard shots. Keep scene timing, character positions, camera direction, and environment continuity aligned with the approved task.', inputs: ['script', 'dialogue', 'duration', 'character_reference_sheets', 'environment_design'], outputs: ['storyboard_shots'] },
    { id: 'video_generation', name: 'Video Generation', instructions: 'Generate the requested duration from the pinned script, dialogue, character references, environment, and storyboard. Do not invent or change scenes. Use only the model provider selected by the workflow owner.', inputs: ['approved_brief', 'character_reference_sheets', 'environment_design', 'storyboard_shots', 'model_provider'], outputs: ['video_artifact'] },
    { id: 'final_output', name: 'Final Output', instructions: 'Check the finished clip against the approved character designs, script, dialogue, shot order, duration, and environment. Return the output artifact and group it under a folder named with the six-digit task code.', inputs: ['video_artifact', 'task_code', 'approved_brief'], outputs: ['continuity_report', 'final_video', 'task_folder'] },
  ],
}

const TOOLS = [
  {
    name: 'get_workflow',
    description: 'Read the ordered movie-production workflow and its continuity rules. Call this before processing a task code.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_task',
    description: 'Load the task record for a six-digit code from the configured task API. Returns task instructions and assets metadata when present.',
    inputSchema: { type: 'object', properties: { task_code: { type: 'string', pattern: '^\\d{6}$', description: 'The six-digit movie task code.' } }, required: ['task_code'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'run_task',
    description: 'Submit a task to the configured task API using POST /api/tasks/{code}/complete, the same route as the studio Run button. The API must be configured to execute or queue the work; this tool does not call a model directly.',
    inputSchema: { type: 'object', properties: { task_code: { type: 'string', pattern: '^\\d{6}$', description: 'The six-digit movie task code.' } }, required: ['task_code'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
]

function jsonrpc(res, id, result) {
  return res.status(200).json({ jsonrpc: '2.0', id, result })
}

function rpcError(res, id, code, message, status = 200) {
  return res.status(status).json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
}

function allowedOrigin(origin) {
  if (!origin) return true
  const allowed = (process.env.MCP_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean)
  return allowed.includes(origin)
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin
  if (!origin) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Mcp-Protocol-Version')
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('Vary', 'Origin')
}

function bearerMatches(req) {
  const expected = process.env.MCP_ACCESS_TOKEN || ''
  const authorization = req.headers.authorization || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expected || !supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes)
}

function parseBody(body) {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body
  if (Buffer.isBuffer(body)) body = body.toString('utf8')
  if (typeof body !== 'string') return null
  try { return JSON.parse(body) } catch { return null }
}

async function taskApi(req, code, action = '', method = 'GET') {
  const apiOrigin = process.env.TASK_API_ORIGIN || 'https://mcp.dabcloud.in'
  let origin
  try { origin = new URL(apiOrigin) } catch { throw new Error('TASK_API_ORIGIN must be a valid HTTPS URL.') }
  if (origin.protocol !== 'https:') throw new Error('TASK_API_ORIGIN must use HTTPS.')
  const siteOrigin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const url = new URL(`/api/tasks/${code}${action}`, origin)
  if (url.origin === siteOrigin) throw new Error('TASK_API_ORIGIN points back to this website. Configure the separate task API origin to avoid a proxy loop.')
  const headers = { Accept: 'application/json' }
  if (process.env.TASK_API_TOKEN) headers.Authorization = `Bearer ${process.env.TASK_API_TOKEN}`
  const response = await fetch(url, { method, headers, redirect: 'manual' })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { message: text.slice(0, 2000) } }
  if (!response.ok || data?.success === false) throw new Error(data?.error || data?.message || `Task API returned HTTP ${response.status}.`)
  return { status: response.status, data }
}

function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false }
}

function toolFailure(error) {
  const message = error instanceof Error ? error.message : 'The tool call failed.'
  return { content: [{ type: 'text', text: message }], structuredContent: { error: message }, isError: true }
}

async function callTool(req, name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be a JSON object.')
  if (name === 'get_workflow') return toolResult(WORKFLOW)
  if (name !== 'get_task' && name !== 'run_task') throw new Error(`Unknown tool: ${name}`)
  const code = String(args.task_code || '')
  if (!TASK_CODE.test(code)) throw new Error('task_code must contain exactly six digits.')
  const result = name === 'get_task'
    ? await taskApi(req, code)
    : await taskApi(req, code, '/complete', 'POST')
  return toolResult({ task_code: code, ...result })
}

module.exports = async function mcpHandler(req, res) {
  setCorsHeaders(req, res)
  if (!allowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origin is not allowed.' })
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method === 'GET') return res.setHeader('Allow', 'POST, GET, OPTIONS').status(405).end()
  if (req.method !== 'POST') return res.setHeader('Allow', 'POST, GET, OPTIONS').status(405).json({ error: 'Method not allowed.' })
  if (!process.env.MCP_ACCESS_TOKEN) return res.status(503).json({ error: 'MCP_ACCESS_TOKEN is not configured.' })
  if (!bearerMatches(req)) return res.status(401).json({ error: 'Unauthorized.' })

  const message = parseBody(req.body)
  if (!message) return rpcError(res, null, -32700, 'Parse error.', 400)
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string' || Array.isArray(message)) return rpcError(res, message.id, -32600, 'Invalid Request.', 400)
  const hasId = Object.prototype.hasOwnProperty.call(message, 'id')
  const id = hasId ? message.id : undefined

  if (message.method.startsWith('notifications/')) return res.status(202).end()
  if (!hasId) return res.status(202).end()
  if (message.method === 'initialize') {
    return jsonrpc(res, id, {
      protocolVersion: message.params?.protocolVersion === MCP_VERSION ? MCP_VERSION : MCP_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'dabcloud-movie-workflow', version: '1.0.0' },
      instructions: 'Call get_workflow first, then get_task with the six-digit task code. Review the source instructions and model route before running the task.',
    })
  }
  if (message.method === 'ping') return jsonrpc(res, id, {})
  if (message.method === 'tools/list') return jsonrpc(res, id, { tools: TOOLS })
  if (message.method === 'tools/call') {
    const name = message.params?.name
    if (!TOOLS.some((tool) => tool.name === name)) return rpcError(res, id, -32602, `Unknown tool: ${String(name || '')}`)
    try { return jsonrpc(res, id, await callTool(req, name, message.params?.arguments || {})) }
    catch (error) { return jsonrpc(res, id, toolFailure(error)) }
  }
  return rpcError(res, id, -32601, `Method not found: ${message.method}`)
}
