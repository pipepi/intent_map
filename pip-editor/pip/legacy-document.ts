/** 旧文档的只读兼容入口：先恢复结构，再迁移语义身份。 */
import { createCorePipGraph } from "./core-graph.ts";
import { createGraph, setGraphNode, setGraphRevision } from "./pip-model.ts";
import { migrate_identifier } from "./legacy-identifiers.ts";
import { migrate_fork_levels } from "./legacy-fork-level.ts";
import { migrate_graph, migrate_workspace } from "./legacy-semantics.ts";
import { PipForkLevel, type Pip, type PipRef, type PipValue, type JsonValue } from "./types.ts";

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read_ref(value: unknown): PipRef {
  if (!is_record(value) || typeof value.nodeId !== "string" || typeof value.relationId !== "string") {
    throw new Error("Invalid legacy reference");
  }
  return { node_id: value.nodeId, pip_id: value.relationId };
}

function read_value(value: unknown, depth = 0): PipValue {
  if (depth > 64 || !is_record(value)) {
    throw new Error("Invalid legacy value");
  }
  if (value.kind === "const") {
    return { kind: "const", value: value.value as JsonValue };
  }
  if (value.kind === "ref") {
    return { kind: "ref", target: read_ref(value.target) };
  }
  if (value.kind === "op" && typeof value.op === "string" && Array.isArray(value.args)) {
    return {
      kind: "op",
      op: value.op,
      args: value.args.map(item => read_value(item, depth + 1)),
    };
  }
  throw new Error("Invalid legacy value");
}

function read_pipe(value: unknown, depth = 0): Pip {
  if (depth > 64 || !is_record(value) || typeof value.id !== "string" || !Array.isArray(value.relations)) {
    throw new Error("Invalid legacy relation");
  }
  return {
    id: value.id,
    fork_level: PipForkLevel.PIPE,
    predicate_value: {
      predicate: read_ref(value.predicate),
      value: read_value(value.object),
    },
    pips: value.relations.map(item => read_pipe(item, depth + 1)),
  };
}

export function legacyDocumentValues(value: unknown): {
  graph: Pip;
  rootNodeIds: string[];
  workspace: JsonValue;
} | undefined {
  if (!is_record(value) || "fork_level" in value) {
    return;
  }
  let values: Record<string, unknown>;
  if (value.id === "relation-workspace@2" && Array.isArray(value.relations)) {
    values = Object.create(null);
    for (const item of value.relations) {
      if (!is_record(item) || typeof item.id !== "string" || item.id in values || !("value" in item)) {
        throw new Error("Invalid legacy document entries");
      }
      values[item.id] = item.value;
    }
  } else if (value.format === "relation-workspace" && value.schemaVersion === 1) {
    values = value;
  } else {
    return;
  }
  if (!is_record(values.graph) || !Array.isArray(values.rootNodeIds) || !("workspace" in values)) {
    throw new Error("Invalid legacy document");
  }
  let graph: Pip;
  if (values.graph.fork_level === PipForkLevel.GRAPH || values.graph.fork_level === 1) {
    graph = migrate_graph(migrate_fork_levels(values.graph) as Pip);
  } else {
    if (!is_record(values.graph.nodes) || typeof values.graph.revision !== "number") {
      throw new Error("Invalid legacy graph");
    }
    const nodes: Record<string, Pip> = Object.create(null);
    for (const [id, node] of Object.entries(values.graph.nodes)) {
      if (!is_record(node) || node.id !== id || !Array.isArray(node.relations)) {
        throw new Error("Invalid legacy node");
      }
      nodes[id] = {
        id,
        fork_level: PipForkLevel.NODE,
        pips: node.relations.map(item => read_pipe(item)),
      };
    }
    // 先检测旧数据内部的身份碰撞，再补齐新模型必需的核心节点。
    const migrated_graph = migrate_graph(createGraph(nodes, values.graph.revision));
    graph = createCorePipGraph();
    for (const node of migrated_graph.pips) {
      if (node.fork_level === PipForkLevel.NODE) {
        setGraphNode(graph, node);
      }
    }
    setGraphRevision(graph, values.graph.revision);
  }
  return {
    graph,
    rootNodeIds: values.rootNodeIds.map(id => typeof id === "string" ? migrate_identifier(id) : id) as string[],
    workspace: migrate_workspace(values.workspace as JsonValue),
  };
}
