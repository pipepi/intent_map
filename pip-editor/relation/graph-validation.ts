/** Input: unknown graph data. Output: a structurally valid, closed RelationGraph or an error. */
import type { JsonValue, Relation, RelationGraph, RelationObject, RelationRef } from "./types.ts";
import { createRelationIndex } from "./reference-index.ts";
import { relationKey, walkRelations } from "./traversal.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const assertId: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f]/.test(value)) throw new Error(`${label} is invalid`);
};
const assertJson: (value: unknown, label: string) => asserts value is JsonValue = (value, label) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${label} contains a non-finite number`);
  }
  if (Array.isArray(value)) return void value.forEach((item, index) => assertJson(item, `${label}[${index}]`));
  if (!isRecord(value)) throw new Error(`${label} is not JSON`);
  for (const [key, item] of Object.entries(value)) assertJson(item, `${label}.${key}`);
};
const assertRef: (value: unknown, label: string) => asserts value is RelationRef = (value, label) => {
  if (!isRecord(value)) throw new Error(`${label} is invalid`);
  assertId(value.nodeId, `${label}.nodeId`); assertId(value.relationId, `${label}.relationId`);
};
const assertObject: (value: unknown, label: string) => asserts value is RelationObject = (value, label) => {
  if (!isRecord(value)) throw new Error(`${label} is invalid`);
  if (value.kind === "const") { if (!("value" in value)) throw new Error(`${label}.value is missing`); assertJson(value.value, `${label}.value`); return; }
  if (value.kind === "ref") { assertRef(value.target, `${label}.target`); return; }
  if (value.kind === "op") {
    assertId(value.op, `${label}.op`);
    if (!Array.isArray(value.args)) throw new Error(`${label}.args is invalid`);
    value.args.forEach((argument, index) => assertObject(argument, `${label}.args[${index}]`)); return;
  }
  throw new Error(`${label}.kind is invalid`);
};

export const assertRelationGraph: (value: unknown) => asserts value is RelationGraph = (value) => {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !isRecord(value.nodes)) throw new Error("Invalid relation graph");
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
  for (const [source, targets] of index.outgoing) for (const target of targets) {
    if (!index.relations.has(relationKey(target))) throw new Error(`Dangling relation reference from ${source.replace("\u0000", "/")} to ${target.nodeId}/${target.relationId}`);
  }
};
