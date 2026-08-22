/** Input: recursive relations/objects. Output: stable addresses and referenced targets. */
import type { Relation, RelationAddress, RelationObject, RelationRef } from "./types.ts";

const MAX_RELATION_DEPTH = 64;
export const relationKey = ({ nodeId, relationId }: RelationRef) => `${nodeId}\u0000${relationId}`;

export const visitObjectRefs = (object: RelationObject, visit: (ref: RelationRef) => void) => {
  if (object.kind === "ref") visit(object.target);
  if (object.kind === "op") object.args.forEach((argument) => visitObjectRefs(argument, visit));
};

export const walkRelations = (
  nodeId: string,
  relations: Relation[],
  visit: (relation: Relation, address: RelationAddress, depth: number) => void,
  parentRelationId?: string,
  depth = 0,
) => {
  if (depth > MAX_RELATION_DEPTH) throw new Error(`Relation depth exceeds ${MAX_RELATION_DEPTH}`);
  for (const relation of relations) {
    visit(relation, { nodeId, relationId: relation.id, parentRelationId }, depth);
    walkRelations(nodeId, relation.relations, visit, relation.id, depth + 1);
  }
};

export const relationObjectRefs = (object: RelationObject): RelationRef[] => {
  const refs: RelationRef[] = [];
  visitObjectRefs(object, (ref) => refs.push(ref));
  return refs;
};
