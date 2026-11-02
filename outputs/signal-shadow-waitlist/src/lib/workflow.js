export function normalizeTaskCode(value) {
  return String(value ?? "").trim().replace(/^#/, "");
}

export function validateTaskCode(value) {
  const code = normalizeTaskCode(value);
  return /^\d{6}$/.test(code)
    ? { valid: true, code, message: "" }
    : { valid: false, code, message: "Task code must contain exactly six digits." };
}

export function validateWorkflow(nodes, edges, taskCode) {
  const issues = [];
  const code = validateTaskCode(taskCode);
  if (!code.valid) issues.push(code.message);
  if (!Array.isArray(nodes) || nodes.length === 0) return [...issues, "Add workflow nodes before running."];

  const ids = new Set(nodes.map((node) => node.id));
  const byKind = (kind) => nodes.filter((node) => node.data?.kind === kind);
  const starts = byKind("start");
  const outputs = byKind("output");
  if (starts.length !== 1) issues.push("The workflow needs exactly one Production Start node.");
  if (outputs.length !== 1) issues.push("The workflow needs exactly one Final Output node.");

  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges || []) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push("Remove connections that point to deleted nodes.");
      continue;
    }
    outgoing.get(edge.source).push(edge.target);
    incoming.get(edge.target).push(edge.source);
  }
  if (starts.length === 1) {
    const seen = new Set();
    const pending = [starts[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...outgoing.get(id));
    }
    if (outputs.length === 1 && !seen.has(outputs[0].id)) issues.push("Connect Production Start to Final Output so the result has a complete path.");
    const disconnected = nodes.find((node) => !seen.has(node.id));
    if (disconnected) issues.push(`“${disconnected.data?.title || "A node"}” is not connected to Production Start.`);
    if (outputs.length === 1) {
      const reachesOutput = new Set();
      const pendingOutput = [outputs[0].id];
      while (pendingOutput.length) {
        const id = pendingOutput.pop();
        if (reachesOutput.has(id)) continue;
        reachesOutput.add(id);
        pendingOutput.push(...incoming.get(id));
      }
      const deadEnd = nodes.find((node) => !reachesOutput.has(node.id));
      if (deadEnd) issues.push(`“${deadEnd.data?.title || "A node"}” does not connect to Final Output.`);
    }
  }

  const video = byKind("video");
  if (video.length === 0) issues.push("Add a Video Generation node.");
  for (const node of video) {
    if (!["Cloud", "Kaggle", "Local"].includes(node.data?.provider)) {
      issues.push("Choose a model route on every Video Generation node.");
    }
  }
  const cyclic = hasCycle(nodes.map((node) => node.id), outgoing);
  if (cyclic) issues.push("Remove the loop in this workflow before running it.");
  return [...new Set(issues)];
}

function hasCycle(ids, outgoing) {
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return ids.some(visit);
}

export function compactRunHistory(history, entry, limit = 30) {
  return [entry, ...(Array.isArray(history) ? history : [])].slice(0, limit);
}
