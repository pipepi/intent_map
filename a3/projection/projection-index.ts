import { pipSha256 } from "../../app/runtime/pip.ts";
import type { IntentNode } from "../../app/runtime/model.ts";
import {
  readA3CustomNodeExtension,
  type A3CustomNodeData,
} from "../core/custom-nodes.ts";
import {
  assertWorkspaceResourcePath,
  type WorkspaceResource,
  type WorkspaceResourceIndex,
} from "../workspace/resource-index.ts";

export const A3_PROJECTION_INDEX_PATH = "a3/projections/index.json" as const;
export const A3_PROJECTION_INDEX_MIME = "application/vnd.intent-map.a3-projections+json" as const;
export const A3_PROJECTION_INDEX_SCHEMA_VERSION = 1 as const;

const abiPattern = /^[a-z][a-z0-9.-]*\/[1-9]\d*$/;
const projectionIdPattern = /^[a-z][a-z0-9._-]*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export type A3ProjectionMaterialization = "generated" | "manual" | "mixed";

export type A3ProjectionEntry = {
  projectionId: string;
  kind: string;
  sourceNodeId: string;
  sourceSha256: string;
  capability: string;
  materialization: A3ProjectionMaterialization;
  resourcePaths: string[];
};

export type A3ProjectionIndex = {
  schemaVersion: typeof A3_PROJECTION_INDEX_SCHEMA_VERSION;
  projections: A3ProjectionEntry[];
};

export type A3ProjectionDiagnostic = {
  severity: "warning" | "error";
  code:
    | "missing-source"
    | "invalid-custom-node"
    | "capability-mismatch"
    | "stale-source"
    | "missing-resource"
    | "resource-owner-conflict";
  projectionId: string;
  message: string;
  resourcePath?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sortedUnique = (values: readonly string[]) =>
  values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) < 0);

const assertEntry = (value: unknown): A3ProjectionEntry => {
  if (
    !isRecord(value)
    || typeof value.projectionId !== "string"
    || !projectionIdPattern.test(value.projectionId)
    || typeof value.kind !== "string"
    || !abiPattern.test(value.kind)
    || typeof value.sourceNodeId !== "string"
    || !value.sourceNodeId
    || typeof value.sourceSha256 !== "string"
    || !sha256Pattern.test(value.sourceSha256)
    || typeof value.capability !== "string"
    || !abiPattern.test(value.capability)
    || !["generated", "manual", "mixed"].includes(String(value.materialization))
    || !Array.isArray(value.resourcePaths)
    || value.resourcePaths.some((path) => typeof path !== "string")
  ) {
    throw new Error("Invalid a3 projection entry");
  }
  const resourcePaths = value.resourcePaths.map(assertWorkspaceResourcePath);
  if (!sortedUnique(resourcePaths)) {
    throw new Error(`${value.projectionId}: projection resource paths must be sorted and unique`);
  }
  return {
    projectionId: value.projectionId,
    kind: value.kind,
    sourceNodeId: value.sourceNodeId,
    sourceSha256: value.sourceSha256,
    capability: value.capability,
    materialization: value.materialization as A3ProjectionMaterialization,
    resourcePaths,
  };
};

export const assertA3ProjectionIndex = (value: unknown): A3ProjectionIndex => {
  if (
    !isRecord(value)
    || value.schemaVersion !== A3_PROJECTION_INDEX_SCHEMA_VERSION
    || !Array.isArray(value.projections)
  ) {
    throw new Error("Invalid a3 projection index");
  }
  const projections = value.projections.map(assertEntry);
  if (!sortedUnique(projections.map(({ projectionId }) => projectionId))) {
    throw new Error("a3 projections must be sorted and unique by projectionId");
  }
  return { schemaVersion: A3_PROJECTION_INDEX_SCHEMA_VERSION, projections };
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  }
  if (typeof value !== "object") throw new Error("Projection source is not JSON serializable");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
};

export const a3ProjectionSourceSha256 = (node: IntentNode): Promise<string> =>
  pipSha256(new TextEncoder().encode(canonicalJson(node)));

export const a3ProjectionIndexResource = (
  index: A3ProjectionIndex,
): WorkspaceResource => ({
  path: A3_PROJECTION_INDEX_PATH,
  mediaType: A3_PROJECTION_INDEX_MIME,
  bytes: new TextEncoder().encode(JSON.stringify(assertA3ProjectionIndex(index))),
});

export const readA3ProjectionIndexResource = (
  resource: WorkspaceResource,
): A3ProjectionIndex => {
  if (resource.path !== A3_PROJECTION_INDEX_PATH || resource.mediaType !== A3_PROJECTION_INDEX_MIME) {
    throw new Error("Resource is not an a3 projection index");
  }
  return assertA3ProjectionIndex(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(resource.bytes)) as unknown,
  );
};

const collectNodes = (root: IntentNode) => {
  const nodes = new Map<string, IntentNode>();
  const visit = (node: IntentNode) => {
    nodes.set(node.id, node);
    node.children?.forEach(visit);
  };
  visit(root);
  return nodes;
};

const readCustomNode = (
  node: IntentNode,
  entry: A3ProjectionEntry,
  diagnostics: A3ProjectionDiagnostic[],
): A3CustomNodeData | null => {
  try {
    const customNode = readA3CustomNodeExtension(node.extension);
    if (!customNode) {
      diagnostics.push({
        severity: "error",
        code: "invalid-custom-node",
        projectionId: entry.projectionId,
        message: `${entry.sourceNodeId} is not an a3 custom node`,
      });
    }
    return customNode;
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "invalid-custom-node",
      projectionId: entry.projectionId,
      message: error instanceof Error ? error.message : "Invalid a3 custom node",
    });
    return null;
  }
};

export const auditA3ProjectionIndex = async ({
  index: indexInput,
  root,
  resources,
}: {
  index: A3ProjectionIndex;
  root: IntentNode;
  resources: WorkspaceResourceIndex;
}): Promise<A3ProjectionDiagnostic[]> => {
  const index = assertA3ProjectionIndex(indexInput);
  const nodes = collectNodes(root);
  const resourcePaths = new Set(resources.resources.map(({ path }) => path));
  const owners = new Map<string, string>();
  const diagnostics: A3ProjectionDiagnostic[] = [];

  for (const entry of index.projections) {
    const source = nodes.get(entry.sourceNodeId);
    if (!source) {
      diagnostics.push({
        severity: "error",
        code: "missing-source",
        projectionId: entry.projectionId,
        message: `Projection source does not exist: ${entry.sourceNodeId}`,
      });
    } else {
      const customNode = readCustomNode(source, entry, diagnostics);
      if (customNode && customNode.capability !== entry.capability) {
        diagnostics.push({
          severity: "error",
          code: "capability-mismatch",
          projectionId: entry.projectionId,
          message: `${entry.projectionId} declares ${entry.capability}, source requires ${customNode.capability}`,
        });
      }
      if (await a3ProjectionSourceSha256(source) !== entry.sourceSha256) {
        diagnostics.push({
          severity: "warning",
          code: "stale-source",
          projectionId: entry.projectionId,
          message: `Projection source changed: ${entry.sourceNodeId}`,
        });
      }
    }

    for (const resourcePath of entry.resourcePaths) {
      if (!resourcePaths.has(resourcePath)) {
        diagnostics.push({
          severity: "error",
          code: "missing-resource",
          projectionId: entry.projectionId,
          resourcePath,
          message: `Projection resource does not exist: ${resourcePath}`,
        });
      }
      const owner = owners.get(resourcePath);
      if (owner) {
        diagnostics.push({
          severity: "error",
          code: "resource-owner-conflict",
          projectionId: entry.projectionId,
          resourcePath,
          message: `${resourcePath} is already owned by ${owner}`,
        });
      } else {
        owners.set(resourcePath, entry.projectionId);
      }
    }
  }
  return diagnostics;
};
