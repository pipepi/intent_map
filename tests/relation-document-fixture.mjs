import { createRelationDocument } from "../app/relation/document.ts";
import { createCoreRelationGraph } from "../app/relation/model.ts";

const identity = { nodeId: "relation.core.identity", relationId: "identity" };
const relation = (id, value) => ({ id, predicate: identity, object: { kind: "const", value }, relations: [] });
const ref = (id, nodeId) => ({ id, predicate: identity, object: { kind: "ref", target: { nodeId, relationId: "identity" } }, relations: [] });

export const sampleRelationDocument = (depth = 1) => {
  const graph = createCoreRelationGraph();
  const nodes = [];
  for (let index = 0; index < depth; index += 1) {
    const id = index ? `sample.depth-${index + 1}` : "sample.root";
    const childId = index + 1 < depth ? `sample.depth-${index + 2}` : undefined;
    nodes.push({ id, relations: [relation("identity", id), relation("name", `第 ${index + 1} 层`), ...(childId ? [ref("contains", childId)] : [])] });
  }
  for (const node of nodes) graph.nodes[node.id] = node;
  return createRelationDocument(graph, ["sample.root"], { views: ["relation-graph"] });
};
