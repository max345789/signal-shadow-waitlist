import test from "node:test";
import assert from "node:assert/strict";
import { compactRunHistory, normalizeTaskCode, validateTaskCode, validateWorkflow } from "./workflow.js";

const node = (id, kind, extra = {}) => ({ id, data: { kind, title: kind, ...extra } });
const standardNodes = [node("start", "start"), node("brief", "brief"), node("video", "video", { provider: "Kaggle" }), node("output", "output")];
const standardEdges = [
  { source: "start", target: "brief" },
  { source: "brief", target: "video" },
  { source: "video", target: "output" },
];

test("task code normalization preserves only a leading hash convention and validation requires six digits", () => {
  assert.equal(normalizeTaskCode("#565349"), "565349");
  assert.equal(validateTaskCode("565349").valid, true);
  assert.equal(validateTaskCode("56534").valid, false);
  assert.equal(validateTaskCode("5653490").valid, false);
  assert.equal(validateTaskCode("56a349").valid, false);
});

test("a complete connected graph passes validation", () => {
  assert.deepEqual(validateWorkflow(standardNodes, standardEdges, "565349"), []);
});

test("validation catches disconnected nodes and absent required output", () => {
  const issues = validateWorkflow([...standardNodes.filter((item) => item.data.kind !== "output"), node("orphan", "cast")], standardEdges.filter((edge) => edge.target !== "output"), "565349");
  assert.ok(issues.some((issue) => issue.includes("exactly one Final Output")));
  assert.ok(issues.some((issue) => issue.includes("not connected")));
});

test("validation catches nodes that start correctly but bypass final output", () => {
  const nodes = [node("start", "start"), node("video", "video"), node("output", "output"), node("orphan-end", "brief")];
  const edges = [{ source: "start", target: "video" }, { source: "video", target: "output" }, { source: "start", target: "orphan-end" }];
  assert.ok(validateWorkflow(nodes, edges, "565349").some((issue) => issue.includes("does not connect to Final Output")));
});

test("validation catches cycles and invalid provider routes", () => {
  const issues = validateWorkflow(standardNodes, [...standardEdges, { source: "output", target: "start" }], "565349");
  assert.ok(issues.some((issue) => issue.includes("loop")));
  const noRoute = standardNodes.map((item) => item.id === "video" ? node("video", "video") : item);
  assert.ok(validateWorkflow(noRoute, standardEdges, "565349").some((issue) => issue.includes("model route")));
});

test("run history is newest-first and bounded", () => {
  const current = [{ runId: "old" }];
  const next = compactRunHistory(current, { runId: "new" }, 1);
  assert.deepEqual(next, [{ runId: "new" }]);
  assert.deepEqual(current, [{ runId: "old" }]);
});
