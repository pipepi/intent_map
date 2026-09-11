import type { ExecutionBinding, PipOperator } from "../contracts/package-types.ts";
import type { JsonValue } from "../../pip/index.ts";

export const valueKey = (nodeId: string, pip_id: string) => `${nodeId}\u0000${pip_id}`;
export async function evaluateBinding(binding: ExecutionBinding | undefined, values: Map<string, JsonValue>, operators: Map<string, PipOperator>): Promise<JsonValue | undefined> {
    if (!binding)
        return undefined;
    if (binding.target)
        return values.get(valueKey(binding.target.node_id, binding.target.pip_id));
    if ("value" in binding)
        return binding.value;
    if (binding.op) {
        const operator = operators.get(binding.op);
        if (!operator)
            throw new Error(`Unknown pip operator ${binding.op}`);
        const args = await Promise.all((binding.args ?? []).map((item) => evaluateBinding(item, values, operators)));
        return operator.evaluate(args.map((item) => item ?? null));
    }
    return undefined;
}
