export type PipLimit =
  | { mode: "ask" }
  | { mode: "unlimited" }
  | { mode: "value"; value: string };

export type PipIoPolicy = {
  schemaVersion: 1;
  maxPipBytes: PipLimit;
  maxSingleResourceBytes: PipLimit;
  maxExpandedBytes: PipLimit;
  maxResourceCount: PipLimit;
  maxCompressionRatio: PipLimit;
};

export type PipIoPolicyField = Exclude<keyof PipIoPolicy, "schemaVersion">;
export type PipIoPolicyOverride = Partial<Pick<PipIoPolicy, PipIoPolicyField>>;
export type PipIoPolicySource = "cli" | "session" | "profile" | "package" | "default";

export type ResolvedPipIoPolicy = {
  policy: PipIoPolicy;
  sources: Record<PipIoPolicyField, PipIoPolicySource>;
};

export type PipIoPolicyInputs = {
  cli?: PipIoPolicyOverride;
  session?: PipIoPolicyOverride;
  profile?: PipIoPolicyOverride;
  package?: PipIoPolicyOverride;
};

export type PipLimitDecision =
  | { outcome: "allow" }
  | { outcome: "confirm" }
  | { outcome: "deny"; actual: string; maximum: string };

export const PIP_IO_POLICY_FIELDS = Object.freeze([
  "maxPipBytes",
  "maxSingleResourceBytes",
  "maxExpandedBytes",
  "maxResourceCount",
  "maxCompressionRatio",
] as const satisfies readonly PipIoPolicyField[]);

const ask = (): PipLimit => ({ mode: "ask" });
const unlimited = (): PipLimit => ({ mode: "unlimited" });

export const ASK_PIP_IO_POLICY: PipIoPolicy = Object.freeze({
  schemaVersion: 1,
  maxPipBytes: ask(),
  maxSingleResourceBytes: ask(),
  maxExpandedBytes: ask(),
  maxResourceCount: ask(),
  maxCompressionRatio: ask(),
});

export const UNLIMITED_PIP_IO_POLICY: PipIoPolicy = Object.freeze({
  schemaVersion: 1,
  maxPipBytes: unlimited(),
  maxSingleResourceBytes: unlimited(),
  maxExpandedBytes: unlimited(),
  maxResourceCount: unlimited(),
  maxCompressionRatio: unlimited(),
});

const decimalPattern = /^(0|[1-9]\d*)$/;

export const assertPipLimit = (value: unknown, label = "PIP limit"): PipLimit => {
  if (!value || typeof value !== "object") throw new Error(`${label} is invalid`);
  const candidate = value as Partial<PipLimit> & { value?: unknown };
  if (candidate.mode === "ask" || candidate.mode === "unlimited") {
    if ("value" in candidate) throw new Error(`${label} must not include a value`);
    return candidate as PipLimit;
  }
  if (
    candidate.mode !== "value" ||
    typeof candidate.value !== "string" ||
    !decimalPattern.test(candidate.value)
  ) {
    throw new Error(`${label} must use a non-negative decimal string`);
  }
  return candidate as PipLimit;
};

export const assertPipIoPolicy = (value: unknown): PipIoPolicy => {
  if (!value || typeof value !== "object") throw new Error("Invalid PIP I/O policy");
  const candidate = value as Partial<PipIoPolicy>;
  if (candidate.schemaVersion !== 1) throw new Error("Unsupported PIP I/O policy version");
  for (const field of PIP_IO_POLICY_FIELDS) assertPipLimit(candidate[field], field);
  return candidate as PipIoPolicy;
};

export const resolvePipIoPolicy = (inputs: PipIoPolicyInputs = {}): ResolvedPipIoPolicy => {
  const precedence = [
    ["cli", inputs.cli],
    ["session", inputs.session],
    ["profile", inputs.profile],
    ["package", inputs.package],
  ] as const;
  const policy = { ...ASK_PIP_IO_POLICY };
  const sources = {} as Record<PipIoPolicyField, PipIoPolicySource>;
  for (const field of PIP_IO_POLICY_FIELDS) {
    const selected = precedence.find(([, override]) => override?.[field] !== undefined);
    policy[field] = selected ? assertPipLimit(selected[1]?.[field], field) : ask();
    sources[field] = selected?.[0] ?? "default";
  }
  return { policy, sources };
};

export const evaluatePipLimit = (
  limit: PipLimit,
  actual: bigint | number,
): PipLimitDecision => {
  const actualValue = typeof actual === "bigint" ? actual : BigInt(actual);
  if (actualValue < BigInt(0)) throw new Error("PIP metric cannot be negative");
  if (limit.mode === "unlimited") return { outcome: "allow" };
  if (limit.mode === "ask") return { outcome: "confirm" };
  const maximum = BigInt(limit.value);
  return actualValue <= maximum
    ? { outcome: "allow" }
    : { outcome: "deny", actual: actualValue.toString(), maximum: limit.value };
};

export const pipLimit = (value: bigint | number): PipLimit => {
  const normalized = typeof value === "bigint" ? value : BigInt(value);
  if (normalized < BigInt(0)) throw new Error("PIP limit cannot be negative");
  return { mode: "value", value: normalized.toString() };
};

/**
 * A file chosen explicitly by the user is its own finite I/O envelope. PIP v1
 * stores resources without compression, so no decoded metric can exceed the
 * selected byte length (and its compression ratio is exactly one).
 */
export const selectedPipFilePolicy = (byteLength: number): PipIoPolicy => ({
  schemaVersion: 1,
  maxPipBytes: pipLimit(byteLength),
  maxSingleResourceBytes: pipLimit(byteLength),
  maxExpandedBytes: pipLimit(byteLength),
  maxResourceCount: pipLimit(byteLength),
  maxCompressionRatio: pipLimit(1),
});
