export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RelationRef = {
  nodeId: string;
  relationId: string;
};

export type RelationObject =
  | { kind: "const"; value: JsonValue }
  | { kind: "ref"; target: RelationRef }
  | { kind: "op"; op: string; args: RelationObject[] };

export type Relation = {
  id: string;
  predicate: RelationRef;
  object: RelationObject;
  relations: Relation[];
};

export type RelationNode = {
  id: string;
  relations: Relation[];
};

export type RelationGraph = {
  revision: number;
  nodes: Record<string, RelationNode>;
};

export type RelationPatchOperation =
  | { op: "put-node"; node: RelationNode }
  | { op: "remove-node"; nodeId: string }
  | { op: "put-relation"; nodeId: string; parentRelationId?: string; relation: Relation }
  | { op: "remove-relation"; nodeId: string; relationId: string };

export type RelationPatch = {
  schemaVersion: 1;
  baseRevision: number;
  operations: RelationPatchOperation[];
};

export type RelationAddress = RelationRef & { parentRelationId?: string };

export type RelationIndex = {
  relations: Map<string, Relation>;
  addresses: Map<string, RelationAddress>;
  outgoing: Map<string, RelationRef[]>;
  incoming: Map<string, RelationRef[]>;
};

export type AppliedRelationPatch = {
  graph: RelationGraph;
  inverse: RelationPatch;
};

const MAX_RELATION_DEPTH = 64;
const keyOf = ({ nodeId, relationId }: RelationRef) => `${nodeId}\u0000${relationId}`;
const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertId: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
};

const assertJson: (value: unknown, label: string) => asserts value is JsonValue = (value, label) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${label} contains a non-finite number`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) throw new Error(`${label} is not JSON`);
  for (const [key, item] of Object.entries(value)) assertJson(item, `${label}.${key}`);
};

const assertRef: (value: unknown, label: string) => asserts value is RelationRef = (value, label) => {
  if (!isRecord(value)) throw new Error(`${label} is invalid`);
  assertId(value.nodeId, `${label}.nodeId`);
  assertId(value.relationId, `${label}.relationId`);
};

const visitObjectRefs = (object: RelationObject, visit: (ref: RelationRef) => void) => {
  if (object.kind === "ref") visit(object.target);
  if (object.kind === "op") object.args.forEach((argument) => visitObjectRefs(argument, visit));
};

const assertObject: (value: unknown, label: string) => asserts value is RelationObject = (value, label) => {
  if (!isRecord(value)) throw new Error(`${label} is invalid`);
  if (value.kind === "const") {
    if (!("value" in value)) throw new Error(`${label}.value is missing`);
    assertJson(value.value, `${label}.value`);
    return;
  }
  if (value.kind === "ref") {
    assertRef(value.target, `${label}.target`);
    return;
  }
  if (value.kind === "op") {
    assertId(value.op, `${label}.op`);
    if (!Array.isArray(value.args)) throw new Error(`${label}.args is invalid`);
    value.args.forEach((argument, index) => assertObject(argument, `${label}.args[${index}]`));
    return;
  }
  throw new Error(`${label}.kind is invalid`);
};

const walkRelations = (
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

export const createRelationIndex = (graph: RelationGraph): RelationIndex => {
  const relations = new Map<string, Relation>();
  const addresses = new Map<string, RelationAddress>();
  const outgoing = new Map<string, RelationRef[]>();
  const incoming = new Map<string, RelationRef[]>();

  const addReference = (owner: RelationRef, target: RelationRef) => {
    const ownerKey = keyOf(owner);
    const targetKey = keyOf(target);
    outgoing.set(ownerKey, [...(outgoing.get(ownerKey) ?? []), target]);
    incoming.set(targetKey, [...(incoming.get(targetKey) ?? []), owner]);
  };

  for (const node of Object.values(graph.nodes)) {
    walkRelations(node.id, node.relations, (relation, address) => {
      const key = keyOf(address);
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

export const assertRelationGraph: (value: unknown) => asserts value is RelationGraph = (value) => {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !isRecord(value.nodes)) {
    throw new Error("Invalid relation graph");
  }
  for (const [nodeId, rawNode] of Object.entries(value.nodes)) {
    if (!isRecord(rawNode)) throw new Error(`Node ${nodeId} is invalid`);
    assertId(rawNode.id, `Node ${nodeId}.id`);
    if (rawNode.id !== nodeId) throw new Error(`Node key does not match id: ${nodeId}`);
    if (!Array.isArray(rawNode.relations)) throw new Error(`Node ${nodeId}.relations is invalid`);
    walkRelations(nodeId, rawNode.relations as Relation[], (rawRelation, address) => {
      if (!isRecord(rawRelation)) throw new Error(`Relation ${address.relationId} is invalid`);
      assertId(rawRelation.id, `Relation ${nodeId}.id`);
      assertRef(rawRelation.predicate, `Relation ${nodeId}/${rawRelation.id}.predicate`);
      assertObject(rawRelation.object, `Relation ${nodeId}/${rawRelation.id}.object`);
      if (!Array.isArray(rawRelation.relations)) throw new Error(`Relation ${nodeId}/${rawRelation.id}.relations is invalid`);
    });
  }
  const index = createRelationIndex(value as RelationGraph);
  for (const [source, targets] of index.outgoing) {
    for (const target of targets) {
      if (!index.relations.has(keyOf(target))) {
        throw new Error(`Dangling relation reference from ${source.replace("\u0000", "/")} to ${target.nodeId}/${target.relationId}`);
      }
    }
  }
};

const relationList = (graph: RelationGraph, nodeId: string, parentRelationId?: string): Relation[] => {
  const node = graph.nodes[nodeId];
  if (!node) throw new Error(`Unknown relation node ${nodeId}`);
  if (!parentRelationId) return node.relations;
  const index = createRelationIndex(graph);
  const parent = index.relations.get(keyOf({ nodeId, relationId: parentRelationId }));
  if (!parent) throw new Error(`Unknown parent relation ${nodeId}/${parentRelationId}`);
  return parent.relations;
};

const findRelationWithParent = (graph: RelationGraph, nodeId: string, relationId: string) => {
  const index = createRelationIndex(graph);
  const address = index.addresses.get(keyOf({ nodeId, relationId }));
  const relation = index.relations.get(keyOf({ nodeId, relationId }));
  return address && relation ? { address, relation } : undefined;
};

export const applyRelationPatch = (source: RelationGraph, patch: RelationPatch): AppliedRelationPatch => {
  assertRelationGraph(source);
  if (patch.schemaVersion !== 1) throw new Error(`Unsupported relation patch schema ${patch.schemaVersion}`);
  if (patch.baseRevision !== source.revision) throw new Error(`Stale relation patch: expected revision ${source.revision}`);
  if (!Array.isArray(patch.operations)) throw new Error("Invalid relation patch operations");

  const graph = clone(source);
  const inverse: RelationPatchOperation[] = [];
  for (const operation of patch.operations) {
    if (operation.op === "put-node") {
      const previous = graph.nodes[operation.node.id];
      graph.nodes[operation.node.id] = clone(operation.node);
      inverse.unshift(previous ? { op: "put-node", node: clone(previous) } : { op: "remove-node", nodeId: operation.node.id });
      continue;
    }
    if (operation.op === "remove-node") {
      const previous = graph.nodes[operation.nodeId];
      if (!previous) throw new Error(`Unknown relation node ${operation.nodeId}`);
      delete graph.nodes[operation.nodeId];
      inverse.unshift({ op: "put-node", node: clone(previous) });
      continue;
    }
    if (operation.op === "put-relation") {
      const existing = findRelationWithParent(graph, operation.nodeId, operation.relation.id);
      const list = relationList(graph, operation.nodeId, operation.parentRelationId);
      if (existing && existing.address.parentRelationId !== operation.parentRelationId) {
        throw new Error(`Relation ${operation.nodeId}/${operation.relation.id} already belongs to another parent`);
      }
      const index = list.findIndex((relation) => relation.id === operation.relation.id);
      if (index >= 0) list[index] = clone(operation.relation);
      else list.push(clone(operation.relation));
      inverse.unshift(existing
        ? { op: "put-relation", nodeId: operation.nodeId, parentRelationId: existing.address.parentRelationId, relation: clone(existing.relation) }
        : { op: "remove-relation", nodeId: operation.nodeId, relationId: operation.relation.id });
      continue;
    }
    if (operation.op === "remove-relation") {
      const existing = findRelationWithParent(graph, operation.nodeId, operation.relationId);
      if (!existing) throw new Error(`Unknown relation ${operation.nodeId}/${operation.relationId}`);
      const list = relationList(graph, operation.nodeId, existing.address.parentRelationId);
      list.splice(list.findIndex((relation) => relation.id === operation.relationId), 1);
      inverse.unshift({ op: "put-relation", nodeId: operation.nodeId, parentRelationId: existing.address.parentRelationId, relation: clone(existing.relation) });
      continue;
    }
    throw new Error("Unsupported relation patch operation");
  }

  graph.revision += 1;
  assertRelationGraph(graph);
  return {
    graph,
    inverse: { schemaVersion: 1, baseRevision: graph.revision, operations: inverse },
  };
};

const bootstrapNode = (id: string, predicate: RelationRef): RelationNode => ({
  id,
  relations: [{
    id: "identity",
    predicate,
    object: { kind: "const", value: id },
    relations: [],
  }],
});

export const createCoreRelationGraph = (): RelationGraph => {
  const identity = { nodeId: "relation.core.identity", relationId: "identity" };
  const graph: RelationGraph = {
    revision: 0,
    nodes: {
      "relation.core.identity": bootstrapNode("relation.core.identity", identity),
      "relation.core.predicate": bootstrapNode("relation.core.predicate", identity),
      "relation.core.type": bootstrapNode("relation.core.type", identity),
    },
  };
  graph.nodes["relation.core.identity"].relations.push({
    id: "type",
    predicate: { nodeId: "relation.core.type", relationId: "identity" },
    object: { kind: "ref", target: { nodeId: "relation.core.predicate", relationId: "identity" } },
    relations: [],
  });
  graph.nodes["relation.core.predicate"].relations.push({
    id: "type",
    predicate: { nodeId: "relation.core.type", relationId: "identity" },
    object: { kind: "ref", target: { nodeId: "relation.core.predicate", relationId: "identity" } },
    relations: [],
  });
  graph.nodes["relation.core.type"].relations.push({
    id: "type",
    predicate: { nodeId: "relation.core.type", relationId: "identity" },
    object: { kind: "ref", target: { nodeId: "relation.core.predicate", relationId: "identity" } },
    relations: [],
  });
  assertRelationGraph(graph);
  return graph;
};

export const relationKey = keyOf;
export const relationObjectRefs = (object: RelationObject): RelationRef[] => {
  const refs: RelationRef[] = [];
  visitObjectRefs(object, (ref) => refs.push(ref));
  return refs;
};
