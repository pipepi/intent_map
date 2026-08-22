/** Input: an observed PIP size metric. Output: allow, reject, or explicit confirmation. */
import { ASK_PIP_IO_POLICY, assertPipIoPolicy, evaluatePipLimit, type PipIoPolicyField } from "./io-policy.ts";
import { PipIoConfirmationRequiredError, type PipIoConfirmationRequest, type PipIoOptions } from "./types.ts";

export const authorizePipIoMetric = async (field: PipIoPolicyField, actual: number | bigint, operation: PipIoConfirmationRequest["operation"], options?: PipIoOptions) => {
  const policy = options?.policy ? assertPipIoPolicy(options.policy) : ASK_PIP_IO_POLICY;
  const actualText = (typeof actual === "bigint" ? actual : BigInt(actual)).toString();
  const decision = evaluatePipLimit(policy[field], actual);
  if (decision.outcome === "allow") return;
  if (decision.outcome === "deny") throw new Error(`${field} exceeded: ${decision.actual}/${decision.maximum}`);
  const request = { field, actual: actualText, operation } as const;
  if (!options?.confirm || !await options.confirm(request)) throw new PipIoConfirmationRequiredError(request);
};
