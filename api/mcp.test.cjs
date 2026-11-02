const test = require('node:test')
const assert = require('node:assert/strict')
const mcpHandler = require('./mcp.js')

function node(id, kind, provider) {
  return { id, data: { kind, provider } }
}

test('MCP accepts a complete acyclic graph and rejects a branch that bypasses output', () => {
  const nodes = [node('start', 'start'), node('video', 'video', 'Kaggle'), node('output', 'output')]
  assert.doesNotThrow(() => mcpHandler.validateWorkflowGraph({ nodes, edges: [
    { source: 'start', target: 'video' }, { source: 'video', target: 'output' },
  ] }))
  assert.throws(() => mcpHandler.validateWorkflowGraph({
    nodes: [...nodes, node('bypass', 'brief')],
    edges: [
      { source: 'start', target: 'video' }, { source: 'video', target: 'output' }, { source: 'start', target: 'bypass' },
    ],
  }), /lead to the final output/)
})

test('MCP rejects duplicate node IDs and invalid provider values', () => {
  const graph = { nodes: [node('start', 'start'), node('video', 'video', 'Kaggle'), node('output', 'output')], edges: [
    { source: 'start', target: 'video' }, { source: 'video', target: 'output' },
  ] }
  assert.throws(() => mcpHandler.validateWorkflowGraph({ ...graph, nodes: [...graph.nodes, node('video', 'brief')] }), /unique/)
  assert.throws(() => mcpHandler.validateWorkflowGraph({ ...graph, nodes: [graph.nodes[0], node('video', 'video', 'Unknown'), graph.nodes[2]] }), /Cloud, Kaggle, or Local/)
})

test('MCP endpoint fails closed when its bearer secret is not configured', async () => {
  const previous = process.env.MCP_ACCESS_TOKEN
  delete process.env.MCP_ACCESS_TOKEN
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    setHeader() { return this },
  }
  try {
    await mcpHandler({ method: 'POST', headers: {}, body: { jsonrpc: '2.0', id: 1, method: 'ping' } }, res)
    assert.equal(res.statusCode, 503)
    assert.match(res.body.error, /not configured/)
  } finally {
    if (previous === undefined) delete process.env.MCP_ACCESS_TOKEN; else process.env.MCP_ACCESS_TOKEN = previous
  }
})
