/** Input/output: the portable RelationGraph document envelope used by PIP and workspaces. */
import { assertRelationGraph } from "./graph-validation.ts";
import type { JsonValue, RelationGraph } from "./types.ts";

export type RelationDocument = {
  format: "relation-workspace";
  schemaVersion: 1;
  graph: RelationGraph;
  rootNodeIds: string[];
  workspace: JsonValue;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function loadRelationDocument(value: unknown): RelationDocument {
  if (!isRecord(value) || value.format !== "relation-workspace" || value.schemaVersion !== 1 || !Array.isArray(value.rootNodeIds) || !("workspace" in value)) {
    throw new Error("Unsupported relation workspace document");
  }
  const graph = value.graph;
  assertRelationGraph(graph);
  if (value.rootNodeIds.some((id) => typeof id !== "string" || !graph.nodes[id])) {
    throw new Error("Relation workspace contains an invalid root node");
  }
  JSON.stringify(value.workspace);
  return structuredClone(value) as RelationDocument;
}

export const serializeRelationDocument = (document: RelationDocument) => JSON.stringify(loadRelationDocument(document), null, 2);

export const createRelationDocument = (graph: RelationGraph, rootNodeIds: string[], workspace: JsonValue = {}) =>
  loadRelationDocument({ format: "relation-workspace", schemaVersion: 1, graph, rootNodeIds, workspace });
