/** Input: a revision-bound patch. Output: one validated graph revision plus its inverse patch. */
import type { AppliedRelationPatch, Relation, RelationGraph, RelationPatch, RelationPatchOperation } from "./types.ts";
import { assertRelationGraph } from "./graph-validation.ts";
import { createRelationIndex } from "./reference-index.ts";
import { relationKey } from "./traversal.ts";

const clone = <T>(value: T): T => structuredClone(value);
const relationList = (graph: RelationGraph, nodeId: string, parentRelationId?: string): Relation[] => {
  const node = graph.nodes[nodeId];
  if (!node) throw new Error(`Unknown relation node ${nodeId}`);
  if (!parentRelationId) return node.relations;
  const parent = createRelationIndex(graph).relations.get(relationKey({ nodeId, relationId: parentRelationId }));
  if (!parent) throw new Error(`Unknown parent relation ${nodeId}/${parentRelationId}`);
  return parent.relations;
};
const findRelationWithParent = (graph: RelationGraph, nodeId: string, relationId: string) => {
  const index = createRelationIndex(graph), key = relationKey({ nodeId, relationId });
  const address = index.addresses.get(key), relation = index.relations.get(key);
  return address && relation ? { address, relation } : undefined;
};

export const applyRelationPatch = (source: RelationGraph, patch: RelationPatch): AppliedRelationPatch => {
  assertRelationGraph(source);
  if (patch.schemaVersion !== 1) throw new Error(`Unsupported relation patch schema ${patch.schemaVersion}`);
  if (patch.baseRevision !== source.revision) throw new Error(`Stale relation patch: expected revision ${source.revision}`);
  if (!Array.isArray(patch.operations)) throw new Error("Invalid relation patch operations");
  // Work on a clone so a failed operation or validator can never partially mutate the source revision.
  const graph = clone(source), inverse: RelationPatchOperation[] = [];
  for (const operation of patch.operations) {
    if (operation.op === "put-node") {
      const previous = graph.nodes[operation.node.id]; graph.nodes[operation.node.id] = clone(operation.node);
      inverse.unshift(previous ? { op: "put-node", node: clone(previous) } : { op: "remove-node", nodeId: operation.node.id }); continue;
    }
    if (operation.op === "remove-node") {
      const previous = graph.nodes[operation.nodeId]; if (!previous) throw new Error(`Unknown relation node ${operation.nodeId}`);
      delete graph.nodes[operation.nodeId]; inverse.unshift({ op: "put-node", node: clone(previous) }); continue;
    }
    if (operation.op === "put-relation") {
      const existing = findRelationWithParent(graph, operation.nodeId, operation.relation.id);
      const list = relationList(graph, operation.nodeId, operation.parentRelationId);
      if (existing && existing.address.parentRelationId !== operation.parentRelationId) throw new Error(`Relation ${operation.nodeId}/${operation.relation.id} already belongs to another parent`);
      const index = list.findIndex((relation) => relation.id === operation.relation.id);
      if (index >= 0) list[index] = clone(operation.relation); else list.push(clone(operation.relation));
      inverse.unshift(existing ? { op: "put-relation", nodeId: operation.nodeId, parentRelationId: existing.address.parentRelationId, relation: clone(existing.relation) } : { op: "remove-relation", nodeId: operation.nodeId, relationId: operation.relation.id }); continue;
    }
    if (operation.op === "remove-relation") {
      const existing = findRelationWithParent(graph, operation.nodeId, operation.relationId);
      if (!existing) throw new Error(`Unknown relation ${operation.nodeId}/${operation.relationId}`);
      const list = relationList(graph, operation.nodeId, existing.address.parentRelationId);
      list.splice(list.findIndex((relation) => relation.id === operation.relationId), 1);
      inverse.unshift({ op: "put-relation", nodeId: operation.nodeId, parentRelationId: existing.address.parentRelationId, relation: clone(existing.relation) }); continue;
    }
    throw new Error("Unsupported relation patch operation");
  }
  graph.revision += 1; assertRelationGraph(graph);
  return { graph, inverse: { schemaVersion: 1, baseRevision: graph.revision, operations: inverse } };
};
