/** Input/output: the persistent value, relation, graph, index, and patch shapes. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type RelationRef = { nodeId: string; relationId: string };
export type RelationObject =
  | { kind: "const"; value: JsonValue }
  | { kind: "ref"; target: RelationRef }
  | { kind: "op"; op: string; args: RelationObject[] };
export type Relation = { id: string; predicate: RelationRef; object: RelationObject; relations: Relation[] };
export type RelationNode = { id: string; relations: Relation[] };
export type RelationGraph = { revision: number; nodes: Record<string, RelationNode> };

export type RelationPatchOperation =
  | { op: "put-node"; node: RelationNode }
  | { op: "remove-node"; nodeId: string }
  | { op: "put-relation"; nodeId: string; parentRelationId?: string; relation: Relation }
  | { op: "remove-relation"; nodeId: string; relationId: string };
export type RelationPatch = { schemaVersion: 1; baseRevision: number; operations: RelationPatchOperation[] };
export type RelationAddress = RelationRef & { parentRelationId?: string };
export type RelationIndex = {
  relations: Map<string, Relation>;
  addresses: Map<string, RelationAddress>;
  outgoing: Map<string, RelationRef[]>;
  incoming: Map<string, RelationRef[]>;
};
export type AppliedRelationPatch = { graph: RelationGraph; inverse: RelationPatch };
