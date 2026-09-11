import { setGraphNode } from "../pip-editor/pip/pip-model.ts";
import { createPipDocument } from "../pip-editor/pip/document.ts";
import { createCorePipGraph } from "../pip-editor/pip/index.ts";

const identity = { node_id: "pip.core.identity", pip_id: "identity" };
const pip = (id, value) => ({ id, fork_level: "pipe", predicate_value: { predicate: identity, value: { kind: "const", value } }, pips: [] });
const ref = (id, nodeId) => ({ id, fork_level: "pipe", predicate_value: { predicate: identity, value: { kind: "ref", target: { node_id: nodeId, pip_id: "identity" } } }, pips: [] });

export const samplePipDocument = (depth = 1) => {
  const graph = createCorePipGraph();
  const nodes = [];
  for (let index = 0; index < depth; index += 1) {
    const id = index ? `sample.depth-${index + 1}` : "sample.root";
        const childId = index + 1 < depth ? `sample.depth-${index + 2}` : undefined;
        nodes.push({ id, fork_level: "node", pips: [pip("identity", id), pip("name", `第 ${index + 1} 层`), ...(childId ? [ref("contains", childId)] : [])] });
    }
    for (const node of nodes)
        setGraphNode(graph, node);
    return createPipDocument(graph, ["sample.root"], { views: ["pip-graph"] });
};
