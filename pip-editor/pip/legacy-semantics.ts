import { PipForkLevel, type Pip, type PipRef, type PipValue } from "./types.ts";
import { assertPip } from "./graph-validation.ts";
import { migrate_identifier } from "./legacy-identifiers.ts";
import { migrate_binding, migrate_workspace } from "./legacy-workspace.ts";

export { migrate_workspace } from "./legacy-workspace.ts";

function migrate_ref(value: PipRef): PipRef {
  return { ...value, node_id: migrate_identifier(value.node_id) };
}

function migrate_value(value: PipValue): PipValue {
  if (value.kind === "ref") {
    return { ...value, target: migrate_ref(value.target) };
  }
  if (value.kind === "op") {
    return {
      ...value,
      op: migrate_identifier(value.op),
      args: value.args.map(migrate_value),
    };
  }
  return value;
}

/** 在副本上同步身份与引用，碰撞直接失败，绝不覆盖用户节点。 */
export function migrate_graph(source: Pip): Pip {
  assertPip(source);
  const graph = structuredClone(source);
  const ids = new Set<string>();
  for (const node of graph.pips) {
    if (node.fork_level !== PipForkLevel.NODE) {
      continue;
    }
    const next_id = migrate_identifier(node.id);
    if (ids.has(next_id)) {
      throw new Error(`Legacy Pip identity collision: ${next_id}`);
    }
    ids.add(next_id);
  }
  const visit = (pip: Pip, owner_id?: string) => {
    const old_id = pip.id;
    if (pip.fork_level === PipForkLevel.NODE) {
      pip.id = migrate_identifier(old_id);
      owner_id = old_id;
    }
    const pair = pip.predicate_value;
    if (pair) {
      pair.predicate = migrate_ref(pair.predicate);
      pair.value = migrate_value(pair.value);
      if (pair.value.kind === "const") {
        if (pair.predicate.node_id === "pip.core.identity" && pair.value.value === owner_id) {
          pair.value.value = migrate_identifier(owner_id!);
        } else if (pair.predicate.node_id === "pip.flow.predicate.binding") {
          // 输入映射保存 payload 字段名，不能按执行表达式改写。
          pair.value.value = migrate_binding(pair.value.value);
        }
      }
    }
    for (const child of pip.pips) {
      visit(child, owner_id);
    }
  };
  visit(graph);
  return graph;
}

export function migrate_legacy_document(source: Pip): Pip {
  assertPip(source);
  const document = structuredClone(source);
  document.id = "pip-workspace@3";
  document.pips = document.pips.map(pip => {
    if (pip.fork_level === PipForkLevel.GRAPH) {
      return migrate_graph(pip);
    }
    // DOCUMENT 的元数据也允许嵌套 PIPE，先统一迁移其中所有引用。
    pip = migrate_graph(pip);
    const pair = pip.predicate_value;
    if (pair) {
      pair.predicate = migrate_ref(pair.predicate);
      pair.value = migrate_value(pair.value);
      if (pair.value.kind === "const") {
        if (pair.predicate.node_id === "pip.meta.root-node-ids" && Array.isArray(pair.value.value)) {
          pair.value.value = pair.value.value.map(id => typeof id === "string" ? migrate_identifier(id) : id);
        } else if (pair.predicate.node_id === "pip.meta.workspace") {
          pair.value.value = migrate_workspace(pair.value.value);
        }
      }
    }
    return pip;
  });
  return document;
}
