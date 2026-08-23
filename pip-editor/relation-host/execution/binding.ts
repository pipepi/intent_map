import type { ExecutionBinding, RelationOperator } from "../contracts/package-types.ts";
import type { JsonValue } from "../../relation/index.ts";

export const valueKey = (nodeId: string, relationId: string) => `${nodeId}\u0000${relationId}`;

export async function evaluateBinding(
  binding: ExecutionBinding | undefined,
  values: Map<string, JsonValue>,
  operators: Map<string, RelationOperator>,
): Promise<JsonValue | undefined> {
  if (!binding) return undefined;
  if (binding.target) return values.get(valueKey(binding.target.nodeId, binding.target.relationId));
  if ("value" in binding) return binding.value;
  if (binding.op) {
    const operator = operators.get(binding.op);
    if (!operator) throw new Error(`Unknown relation operator ${binding.op}`);
    const args = await Promise.all((binding.args ?? []).map((item) => evaluateBinding(item, values, operators)));
    return operator.evaluate(args.map((item) => item ?? null));
  }
  return undefined;
}
