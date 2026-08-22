/** Input: one RelationGraph. Output: addresses plus derived outgoing/incoming reference views. */
import type { Relation, RelationGraph, RelationIndex, RelationRef } from "./types.ts";
import { relationKey, visitObjectRefs, walkRelations } from "./traversal.ts";

export const createRelationIndex = (graph: RelationGraph): RelationIndex => {
  const relations = new Map<string, Relation>();
  const addresses = new Map();
  const outgoing = new Map<string, RelationRef[]>();
  const incoming = new Map<string, RelationRef[]>();
  const addReference = (owner: RelationRef, target: RelationRef) => {
    const ownerKey = relationKey(owner), targetKey = relationKey(target);
    outgoing.set(ownerKey, [...(outgoing.get(ownerKey) ?? []), target]);
    // Incoming relations are derived here; consumers persist only their outgoing refs.
    incoming.set(targetKey, [...(incoming.get(targetKey) ?? []), owner]);
  };
  for (const node of Object.values(graph.nodes)) {
    walkRelations(node.id, node.relations, (relation, address) => {
      const key = relationKey(address);
      if (relations.has(key)) throw new Error(`Duplicate relation id ${node.id}/${relation.id}`);
      relations.set(key, relation);
      addresses.set(key, address);
      const owner = { nodeId: node.id, relationId: relation.id };
      addReference(owner, relation.predicate);
      visitObjectRefs(relation.object, (target) => addReference(owner, target));
    });
  }
  return { relations, addresses, outgoing, incoming };
};
