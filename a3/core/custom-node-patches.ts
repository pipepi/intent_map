import { pipSha256 } from "../../app/runtime/pip.ts";
import type { IntentNode, IntentNodeExtension } from "../../app/runtime/model.ts";
import {
  A3_CUSTOM_NODE_NAMESPACE,
  assertA3CustomNodeData,
  createA3CustomNodeExtension,
  readA3CustomNodeExtension,
  type A3CustomNodeData,
} from "./custom-nodes.ts";
import { canonicalJson } from "./canonical-json.ts";

export const A3_CUSTOM_NODE_PATCH_SCHEMA_VERSION = 1 as const;

export type A3CustomNodePatchOperation =
  | {
    op: "set";
    nodeId: string;
    expectedExtensionSha256: string;
    data: A3CustomNodeData;
  }
  | {
    op: "clear";
    nodeId: string;
    expectedExtensionSha256: string;
  };

export type A3CustomNodePatch = {
  schemaVersion: typeof A3_CUSTOM_NODE_PATCH_SCHEMA_VERSION;
  operations: A3CustomNodePatchOperation[];
};

const sha256Pattern = /^[a-f0-9]{64}$/;

export const a3ExtensionSha256 = (
  extension: IntentNodeExtension | undefined,
): Promise<string> => pipSha256(
  new TextEncoder().encode(canonicalJson(extension ?? null)),
);

const indexNodes = (root: IntentNode) => {
  const nodes = new Map<string, IntentNode>();
  const visit = (node: IntentNode) => {
    if (nodes.has(node.id)) throw new Error(`Duplicate intent node id: ${node.id}`);
    nodes.set(node.id, node);
    node.children?.forEach(visit);
  };
  visit(root);
  return nodes;
};

const assertPatch = (patch: A3CustomNodePatch): A3CustomNodePatch => {
  if (patch.schemaVersion !== A3_CUSTOM_NODE_PATCH_SCHEMA_VERSION || !Array.isArray(patch.operations)) {
    throw new Error("Invalid a3 custom-node patch");
  }
  const nodeIds = new Set<string>();
  let previous = "";
  for (const operation of patch.operations) {
    if (
      !operation
      || !["set", "clear"].includes(operation.op)
      || typeof operation.nodeId !== "string"
      || !operation.nodeId
      || !sha256Pattern.test(operation.expectedExtensionSha256)
      || nodeIds.has(operation.nodeId)
      || (previous && previous.localeCompare(operation.nodeId) >= 0)
    ) {
      throw new Error("a3 custom-node patch operations must be valid, sorted and unique");
    }
    if (operation.op === "set") assertA3CustomNodeData(operation.data);
    nodeIds.add(operation.nodeId);
    previous = operation.nodeId;
  }
  return patch;
};

export const applyA3CustomNodePatch = async (
  root: IntentNode,
  patchInput: A3CustomNodePatch,
): Promise<{ root: IntentNode; changedNodeIds: string[] }> => {
  const patch = assertPatch(patchInput);
  const result = structuredClone(root);
  const nodes = indexNodes(result);

  for (const operation of patch.operations) {
    const node = nodes.get(operation.nodeId);
    if (!node) throw new Error(`Custom-node patch target does not exist: ${operation.nodeId}`);
    if (await a3ExtensionSha256(node.extension) !== operation.expectedExtensionSha256) {
      throw new Error(`Custom-node extension changed: ${operation.nodeId}`);
    }
    if (node.extension && node.extension.namespace !== A3_CUSTOM_NODE_NAMESPACE) {
      throw new Error(`Custom-node patch cannot overwrite foreign extension: ${operation.nodeId}`);
    }
    if (operation.op === "set") {
      node.extension = createA3CustomNodeExtension(operation.data);
    } else {
      if (!readA3CustomNodeExtension(node.extension)) {
        throw new Error(`Custom-node patch cannot clear an ordinary node: ${operation.nodeId}`);
      }
      delete node.extension;
    }
  }
  return { root: result, changedNodeIds: patch.operations.map(({ nodeId }) => nodeId) };
};
