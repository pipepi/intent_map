import type {
  IntentNode,
  IntentNodeExtension,
  JsonValue,
} from "../../app/runtime/model";

export const A3_CUSTOM_NODE_NAMESPACE = "intent-map.a3.custom-node" as const;
export const A3_CUSTOM_NODE_SCHEMA_VERSION = 1 as const;

const abiPattern = /^[a-z][a-z0-9.-]*\/[1-9]\d*$/;

export type A3CustomNodeData = {
  kind: string;
  capability: string;
  settings: JsonValue;
};

export type A3CustomNodeDescriptor = {
  kind: string;
  capability: string;
  validateSettings?: (settings: JsonValue) => void;
};

export type A3CustomNodeOccurrence = {
  nodeId: string;
  data: A3CustomNodeData;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertAbi = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !abiPattern.test(value)) {
    throw new Error(`${label} must be a versioned ABI identifier`);
  }
  return value;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
};

export const createA3CustomNodeExtension = (
  data: A3CustomNodeData,
): IntentNodeExtension => ({
  namespace: A3_CUSTOM_NODE_NAMESPACE,
  schemaVersion: A3_CUSTOM_NODE_SCHEMA_VERSION,
  data: assertA3CustomNodeData(data),
});

export const assertA3CustomNodeData = (value: unknown): A3CustomNodeData => {
  if (!isRecord(value) || !isJsonValue(value.settings)) {
    throw new Error("Invalid a3 custom-node data");
  }
  return {
    kind: assertAbi(value.kind, "Custom-node kind"),
    capability: assertAbi(value.capability, "Custom-node capability"),
    settings: structuredClone(value.settings),
  };
};

export const readA3CustomNodeExtension = (
  extension: IntentNodeExtension | undefined,
): A3CustomNodeData | null => {
  if (!extension || extension.namespace !== A3_CUSTOM_NODE_NAMESPACE) return null;
  if (extension.schemaVersion !== A3_CUSTOM_NODE_SCHEMA_VERSION) {
    throw new Error(`Unsupported a3 custom-node schema: ${extension.schemaVersion}`);
  }
  return assertA3CustomNodeData(extension.data);
};

export const collectA3CustomNodes = (root: IntentNode): A3CustomNodeOccurrence[] => {
  const occurrences: A3CustomNodeOccurrence[] = [];
  const visit = (node: IntentNode) => {
    const data = readA3CustomNodeExtension(node.extension);
    if (data) occurrences.push({ nodeId: node.id, data });
    node.children?.forEach(visit);
  };
  visit(root);
  return occurrences;
};

export class A3CustomNodeRegistry {
  readonly #descriptors = new Map<string, A3CustomNodeDescriptor>();

  register(descriptor: A3CustomNodeDescriptor): void {
    const kind = assertAbi(descriptor.kind, "Custom-node kind");
    const capability = assertAbi(descriptor.capability, "Custom-node capability");
    if (this.#descriptors.has(kind)) throw new Error(`Custom-node kind is already registered: ${kind}`);
    this.#descriptors.set(kind, { ...descriptor, kind, capability });
  }

  list(): readonly A3CustomNodeDescriptor[] {
    return [...this.#descriptors.values()]
      .sort((left, right) => left.kind.localeCompare(right.kind));
  }

  validate(data: A3CustomNodeData): A3CustomNodeDescriptor {
    const customNode = assertA3CustomNodeData(data);
    const descriptor = this.#descriptors.get(customNode.kind);
    if (!descriptor) throw new Error(`No a3 provider is registered for ${customNode.kind}`);
    if (descriptor.capability !== customNode.capability) {
      throw new Error(`${customNode.kind} requires ${descriptor.capability}, not ${customNode.capability}`);
    }
    descriptor.validateSettings?.(customNode.settings);
    return descriptor;
  }

  validateTree(root: IntentNode): A3CustomNodeOccurrence[] {
    const occurrences = collectA3CustomNodes(root);
    occurrences.forEach(({ data }) => this.validate(data));
    return occurrences;
  }
}
