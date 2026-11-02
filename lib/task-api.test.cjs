const test = require('node:test')
const assert = require('node:assert/strict')
const { forwardTaskRequest, removePrivateFields } = require('./task-api.cjs')

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('task proxy rejects malformed task codes before calling external services', async () => {
  const oldFetch = global.fetch
  global.fetch = () => { throw new Error('fetch should not be called') }
  try {
    const res = responseCapture()
    await forwardTaskRequest({ headers: {}, body: {} }, res, { code: '1234567' })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /exactly six digits/)
  } finally { global.fetch = oldFetch }
})

test('task proxy verifies the session and forwards a signed-in task read', async () => {
  const oldFetch = global.fetch
  const oldUrl = process.env.VITE_SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://auth.example.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-test-key'
  const urls = []
  global.fetch = async (url) => {
    urls.push(String(url))
    if (String(url).endsWith('/auth/v1/user')) return { ok: true }
    return { ok: true, status: 200, text: async () => '{"task_code":"565349","prompt":"approved"}' }
  }
  try {
    const res = responseCapture()
    await forwardTaskRequest({ headers: { authorization: 'Bearer session-token' } }, res, { code: '565349' })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { task_code: '565349', prompt: 'approved' })
    assert.ok(urls.some((url) => url.endsWith('/api/tasks/565349')))
  } finally {
    global.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = oldKey
  }
})

test('task proxy removes private fields from upstream task records', async () => {
  const oldFetch = global.fetch
  const oldUrl = process.env.VITE_SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://auth.example.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-test-key'
  global.fetch = async (url) => String(url).endsWith('/auth/v1/user')
    ? { ok: true }
    : { ok: true, status: 200, text: async () => '{"success":true,"task":{"code":"565349","user_email":"private@example.test","prompt":"approved","metadata":{"api_token":"hidden"}}}' }
  try {
    const res = responseCapture()
    await forwardTaskRequest({ headers: { authorization: 'Bearer session-token' } }, res, { code: '565349' })
    assert.deepEqual(res.body, { success: true, task: { code: '565349', prompt: 'approved', metadata: {} } })
  } finally {
    global.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = oldKey
  }
})

test('private-field filter strips nested contact and credential fields', () => {
  assert.deepEqual(removePrivateFields({ task: { ownerEmail: 'private@example.test', phone_number: '123', script: 'ok', nested: [{ access_token: 'hidden', title: 'safe' }] } }), {
    task: { script: 'ok', nested: [{ title: 'safe' }] },
  })
})

test('task proxy rejects oversized workflow requests before forwarding', async () => {
  const oldFetch = global.fetch
  const oldUrl = process.env.VITE_SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://auth.example.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-test-key'
  global.fetch = async () => ({ ok: true })
  try {
    const res = responseCapture()
    await forwardTaskRequest({ headers: { authorization: 'Bearer session-token' }, body: { graph: { note: 'x'.repeat(4_000_000) } } }, res, { code: '565349', method: 'POST', action: '/complete' })
    assert.equal(res.statusCode, 413)
    assert.match(res.body.error, /4 MB/)
  } finally {
    global.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = oldKey
  }
})
