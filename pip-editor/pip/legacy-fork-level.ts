import { PipForkLevel } from "./types.ts";

const numeric_levels = [
  PipForkLevel.DOCUMENT,
  PipForkLevel.GRAPH,
  PipForkLevel.NODE,
  PipForkLevel.PIPE,
];

/** 只转换结构字段，不遍历 predicate_value 内的用户 JSON；输入保持不变。 */
export function migrate_fork_levels(value: unknown): unknown {
  const result = structuredClone(value);
  const visit = (item: unknown, depth: number) => {
    if (depth > 64) {
      throw new Error("Pip depth exceeds 64");
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.fork_level === "number" && Number.isInteger(record.fork_level)
      && record.fork_level >= 0 && record.fork_level < numeric_levels.length) {
      record.fork_level = numeric_levels[record.fork_level];
    }
    if (Array.isArray(record.pips)) {
      record.pips.forEach(child => visit(child, depth + 1));
    }
  };
  visit(result, 0);
  return result;
}
