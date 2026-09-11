import { PipForkLevel } from "../../pip/types.ts";
import { setGraphNode, graphNodes, graphRevision, createGraph } from "../../pip/pip-model.ts";
/** 维护不进入业务文档的系统 Pip overlay 与实例状态。 */
import {
  assertPipGraph,
  createCorePipGraph,
  type JsonValue,
  type Pip } from "../../pip/index.ts";
import type {
  SystemPluginDefinition,
  SystemPluginInstance,
  SystemPluginRuntimeSnapshot,
} from "./contracts.ts";
import type { SystemPluginRegistry } from "./registry.ts";

const identityRef = {
    node_id: "pip.core.identity",
    pip_id: "identity"
};

export const createSystemPluginTypeNode = (id: string): Pip => ({
  id,
    fork_level: PipForkLevel.NODE,
    pips: [
    {
      id: "identity",
            fork_level: PipForkLevel.PIPE,
            predicate_value: { predicate: identityRef, value: { kind: "const", value: id } },
            pips: []
        },
    {
      id: "type",
            fork_level: PipForkLevel.PIPE,
            predicate_value: { predicate: { node_id: "pip.core.type", pip_id: "identity" }, value: {
        kind: "ref",
        target: {
                        node_id: "pip.core.predicate",
                        pip_id: "identity"
                    },
      } },
            pips: []
        },
  ]
});

const createInstanceNode = (
  id: string,
  definition: SystemPluginDefinition): Pip => ({
  id,
    fork_level: PipForkLevel.NODE,
    pips: [
    {
      id: "identity",
            fork_level: PipForkLevel.PIPE,
            predicate_value: { predicate: identityRef, value: { kind: "const", value: id } },
            pips: []
        },
    {
      id: "type",
            fork_level: PipForkLevel.PIPE,
            predicate_value: { predicate: { node_id: "pip.core.type", pip_id: "identity" }, value: {
        kind: "ref",
        target: {
                        node_id: definition.typeNode.id,
                        pip_id: "identity"
                    },
      } },
            pips: []
        },
  ]
});

export class SystemPluginRuntime {
  readonly #registry: SystemPluginRegistry;
  readonly #instances = new Map<string, SystemPluginInstance>();
  readonly #singletonIds = new Map<string, string>();
  readonly #publish: () => void;
  #graph: Pip;

  constructor(registry: SystemPluginRegistry, publish: () => void) {
    this.#registry = registry;
    this.#publish = publish;
    const graph = createCorePipGraph();
    for (const definition of registry.list()) {
            setGraphNode(graph, structuredClone(definition.typeNode));
    }
    assertPipGraph(graph);
    this.#graph = graph;
  }

  snapshot(): SystemPluginRuntimeSnapshot {
    return {
      graph: this.#graph,
      instances: [...this.#instances.values()],
    };
  }

  get(instanceId: string) {
    return this.#instances.get(instanceId);
  }

  ensure(pluginId: string, workspaceId?: string) {
    const definition = this.#registry.require(pluginId);
    if (definition.scope === "workspace" && !workspaceId) {
      throw new Error(`System plugin ${pluginId} requires a workspace`);
    }
    const singletonKey = definition.scope === "host"
      ? `host:${pluginId}`
      : `workspace:${workspaceId!}:${pluginId}`;

    if (definition.instancePolicy === "singleton") {
      const existingId = this.#singletonIds.get(singletonKey);
      const existing = existingId ? this.#instances.get(existingId) : undefined;
      if (existing) return existing;
    }

    const instanceId = definition.instancePolicy === "singleton"
      ? `system.instance.${singletonKey}`
      : `system.instance.${pluginId}.${crypto.randomUUID()}`;
    const instance: SystemPluginInstance = {
      id: instanceId,
      pluginId,
      node: createInstanceNode(instanceId, definition),
      scope: definition.scope,
      ...(definition.scope === "workspace" ? { workspaceId: workspaceId! } : {}),
      state: structuredClone(definition.createState?.() ?? null),
    };

    this.#instances.set(instanceId, instance);
    if (definition.instancePolicy === "singleton") {
      this.#singletonIds.set(singletonKey, instanceId);
    }
    this.#replaceGraphNode(instance.node);
    return instance;
  }
    setState(instanceId: string, state: JsonValue) {
    JSON.stringify(state);
    const instance = this.#requireInstance(instanceId);
    instance.state = structuredClone(state);
    this.#publish();
  }
    releasePresentation(instanceId: string) {
    const instance = this.get(instanceId);
    if (!instance) return;
    const definition = this.#registry.require(instance.pluginId);
    if (definition.instancePolicy === "multiple") {
      this.#dispose(instance, definition);
    }
  }
    disposeWorkspace(workspaceId: string) {
    for (const instance of [...this.#instances.values()]) {
      if (instance.workspaceId !== workspaceId) continue;
      this.#dispose(instance, this.#registry.require(instance.pluginId));
    }
  }
    /** 应用会话结束时释放包括 host singleton 在内的全部系统插件资源。 */
    disposeAll() {
    const errors: unknown[] = [];
    for (const instance of [...this.#instances.values()]) {
      try {
        this.#dispose(instance, this.#registry.require(instance.pluginId));
      } catch (error) {
        // 一个插件释放失败不能阻断其他系统插件清理。
        errors.push(error);
      }
    }
    return errors;
  }
    #dispose(instance: SystemPluginInstance, definition: SystemPluginDefinition) {
        try {
            definition.dispose?.(instance);
        }
        finally {
            this.#instances.delete(instance.id);
            for (const [key, value] of this.#singletonIds) {
                if (value === instance.id)
                    this.#singletonIds.delete(key);
            }
            const nodes = { ...graphNodes(this.#graph) };
            delete nodes[instance.node.id];
            this.#graph = createGraph(nodes, graphRevision(this.#graph) + 1);
            this.#publish();
        }
    }
    #replaceGraphNode(node: Pip) {
        this.#graph = createGraph({
            ...graphNodes(this.#graph),
            [node.id]: structuredClone(node),
        }, graphRevision(this.#graph) + 1);
        assertPipGraph(this.#graph);
        this.#publish();
    }
    #requireInstance(instanceId: string) {
    const instance = this.get(instanceId);
    if (!instance) {
      throw new Error(`Unknown system plugin instance ${instanceId}`);
    }
    return instance;
  }
}
