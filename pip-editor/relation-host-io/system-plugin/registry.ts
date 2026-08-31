/** 校验并索引随 A2 发布的系统插件定义。 */
import {
  assertRelationGraph,
  createCoreRelationGraph,
} from "../../relation/index.ts";
import type { SystemPluginDefinition } from "./contracts.ts";

function assertSystemTypeNode(definition: SystemPluginDefinition) {
  const graph = createCoreRelationGraph();
  graph.nodes[definition.typeNode.id] = structuredClone(definition.typeNode);
  assertRelationGraph(graph);

  const identity = definition.typeNode.relations.find(
    (relation) => relation.id === "identity",
  );
  const type = definition.typeNode.relations.find(
    (relation) => relation.id === "type",
  );
  if (
    identity?.object.kind !== "const" ||
    identity.object.value !== definition.typeNode.id ||
    identity.predicate.nodeId !== "relation.core.identity" ||
    identity.predicate.relationId !== "identity" ||
    type?.object.kind !== "ref" ||
    type.predicate.nodeId !== "relation.core.type" ||
    type.predicate.relationId !== "identity" ||
    type.object.target.nodeId !== "relation.core.predicate" ||
    type.object.target.relationId !== "identity"
  ) {
    throw new Error(
      `System plugin ${definition.id} type node is not canonical`,
    );
  }
}

export class SystemPluginRegistry {
  readonly #byId = new Map<string, SystemPluginDefinition>();
  readonly #byTypeNodeId = new Map<string, SystemPluginDefinition>();

  constructor(definitions: SystemPluginDefinition[]) {
    for (const definition of definitions) {
      this.#register(definition);
    }
  }

  list() {
    return [...this.#byId.values()];
  }

  get(pluginId: string) {
    return this.#byId.get(pluginId);
  }

  forTypeNode(typeNodeId: string) {
    return this.#byTypeNodeId.get(typeNodeId);
  }

  require(pluginId: string) {
    const definition = this.get(pluginId);
    if (!definition) {
      throw new Error(`Unknown system plugin ${pluginId}`);
    }
    return definition;
  }

  #register(definition: SystemPluginDefinition) {
    if (!definition.id.trim()) {
      throw new Error("System plugin id is required");
    }
    if (this.#byId.has(definition.id)) {
      throw new Error(`Duplicate system plugin ${definition.id}`);
    }
    const typeNodeId = definition.typeNode.id;
    if (!typeNodeId.trim()) {
      throw new Error(`System plugin ${definition.id} has no type node`);
    }
    if (this.#byTypeNodeId.has(typeNodeId)) {
      throw new Error(`Duplicate system plugin type ${typeNodeId}`);
    }
    if (createCoreRelationGraph().nodes[typeNodeId]) {
      throw new Error(`System plugin ${definition.id} reuses a core node`);
    }
    if (!definition.label.trim() || !definition.category.trim()) {
      throw new Error(`System plugin ${definition.id} metadata is invalid`);
    }
    if (!["host", "workspace"].includes(definition.scope)) {
      throw new Error(`System plugin ${definition.id} scope is invalid`);
    }
    if (!["singleton", "multiple"].includes(definition.instancePolicy)) {
      throw new Error(`System plugin ${definition.id} instance policy is invalid`);
    }
    if (
      !Number.isFinite(definition.defaultWindow.width) ||
      !Number.isFinite(definition.defaultWindow.height) ||
      definition.defaultWindow.width < 360 ||
      definition.defaultWindow.height < 420 ||
      definition.defaultWindow.width > 1800 ||
      definition.defaultWindow.height > 1200 ||
      !["simple", "full"].includes(definition.defaultWindow.resizeMode)
    ) {
      throw new Error(`System plugin ${definition.id} window is invalid`);
    }
    assertSystemTypeNode(definition);

    this.#byId.set(definition.id, definition);
    this.#byTypeNodeId.set(typeNodeId, definition);
  }
}
