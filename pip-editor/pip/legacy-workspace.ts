import type { JsonValue } from "./types.ts";
import { migrate_identifier } from "./legacy-identifiers.ts";

const identity_fields = new Set([
  "nodeId", "node_id", "targetNodeId", "observedNodeId", "projectionNodeId",
  "parentProjectionNodeId", "parentInternalProjectionId", "childProjectionId",
  "projectionId", "definitionId", "pluginId", "commandId", "typeNodeId",
  "rootNodeIds", "initialSelection", "selection", "selfWorkspace",
  "selfEmbedded", "childrenWorkspace",
]);
const container_fields = new Set([
  "views", "navigation", "entries", "enteredFrom", "routes", "projection",
  "target", "definition", "origin", "type", "element", "projectionDefaults",
  "workspace", "frame",
]);
const dictionary_fields = new Set(["projections", "systemWindows", "windows", "frames"]);

/** 只遍历宿主定义的结构字段；插件自定义数据与普通文本保持不变。 */
export function migrate_workspace(value: JsonValue, dictionary = false): JsonValue {
  if (Array.isArray(value)) {
    return value.map(item => migrate_workspace(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result: Record<string, JsonValue> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    const next_key = dictionary ? migrate_identifier(key) : key;
    if (Object.hasOwn(result, next_key)) {
      throw new Error(`Legacy workspace identity collision: ${next_key}`);
    }
    if (dictionary) {
      result[next_key] = migrate_workspace(item);
    } else if (identity_fields.has(key)) {
      result[key] = Array.isArray(item)
        ? item.map(id => typeof id === "string" ? migrate_identifier(id) : id)
        : typeof item === "string" ? migrate_identifier(item) : item;
    } else if (container_fields.has(key) || dictionary_fields.has(key)) {
      result[key] = migrate_workspace(item, dictionary_fields.has(key));
    } else {
      result[key] = item;
    }
  }
  return { ...result };
}

/** 执行绑定中的 value 是用户数据，只有 target/op/args 具有执行语义。 */
export function migrate_binding(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const result = { ...value };
  if (result.target) {
    const target = result.target;
    if (typeof target === "object" && !Array.isArray(target)
      && typeof target.nodeId === "string" && typeof target.relationId === "string") {
      // v1/v2 的执行绑定可能把旧引用放在 const 内，必须按绑定语义转换。
      result.target = {
        node_id: migrate_identifier(target.nodeId),
        pip_id: target.relationId,
        ...(typeof target.parentRelationId === "string" ? { pip_id_parent: target.parentRelationId } : {}),
      };
    } else {
      result.target = migrate_workspace(target);
    }
  }
  if (typeof result.op === "string") {
    result.op = migrate_identifier(result.op);
  }
  if (Array.isArray(result.args)) {
    result.args = result.args.map(migrate_binding);
  }
  return result;
}
