/** Input/output: the portable, value-only relation document used by PIP and workspaces. */
import { assertRelationGraph } from "./graph-validation.ts";
import type { JsonValue, RelationGraph } from "./types.ts";

export type RelationOnlyValue =
  | { id: "graph"; value: RelationGraph }
  | { id: "rootNodeIds"; value: string[] }
  | { id: "workspace"; value: JsonValue };

export type RelationDocument = { id: "relation-workspace@2"; relations: RelationOnlyValue[] };

export type RelationDocumentValues = { graph: RelationGraph; rootNodeIds: string[]; workspace: JsonValue };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const legacyValues = (value: Record<string, unknown>): RelationDocumentValues | undefined => {
  if (value.format !== "relation-workspace" || value.schemaVersion !== 1 || !Array.isArray(value.rootNodeIds) || !("workspace" in value)) return;
  return { graph: value.graph as RelationGraph, rootNodeIds: value.rootNodeIds as string[], workspace: value.workspace as JsonValue };
};

const documentValues = (value: Record<string, unknown>): RelationDocumentValues | undefined => {
  if (value.id !== "relation-workspace@2" || !Array.isArray(value.relations)) return;
  const relations = new Map<string, unknown>();
  for (const relation of value.relations) {
    if (!isRecord(relation) || typeof relation.id !== "string" || !("value" in relation) || relations.has(relation.id)) return;
    relations.set(relation.id, relation.value);
  }
  const rootNodeIds = relations.get("rootNodeIds");
  if (!relations.has("graph") || !Array.isArray(rootNodeIds) || !relations.has("workspace")) return;
  return { graph: relations.get("graph") as RelationGraph, rootNodeIds: rootNodeIds as string[], workspace: relations.get("workspace") as JsonValue };
};

const normalizeDocument = ({ graph, rootNodeIds, workspace }: RelationDocumentValues): RelationDocument => ({
  id: "relation-workspace@2",
  relations: [
    { id: "graph", value: graph },
    { id: "rootNodeIds", value: rootNodeIds },
    { id: "workspace", value: workspace },
  ],
});

export function loadRelationDocument(value: unknown): RelationDocument {
  if (!isRecord(value)) throw new Error("Unsupported relation workspace document");
  const values = documentValues(value) ?? legacyValues(value);
  if (!values) throw new Error("Unsupported relation workspace document");
  const { graph, rootNodeIds, workspace } = values;
  assertRelationGraph(graph);
  if (rootNodeIds.some((id) => typeof id !== "string" || !graph.nodes[id])) {
    throw new Error("Relation workspace contains an invalid root node");
  }
  JSON.stringify(workspace);
  return structuredClone(normalizeDocument(values));
}

export const serializeRelationDocument = (document: RelationDocument) => JSON.stringify(loadRelationDocument(document), null, 2);

export const createRelationDocument = (graph: RelationGraph, rootNodeIds: string[], workspace: JsonValue = {}) =>
  loadRelationDocument(normalizeDocument({ graph, rootNodeIds, workspace }));

export function relationDocumentValues(document: RelationDocument): RelationDocumentValues {
  const values = documentValues(document);
  if (!values) throw new Error("Unsupported relation workspace document");
  return values;
}
