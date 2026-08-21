import type { JsonValue } from "../../relation/model.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const assertJsonValue: (value: unknown, label?: string) => asserts value is JsonValue = (value, label = "value") => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${label} contains a non-finite number`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) throw new Error(`${label} is not JSON`);
  for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${label}.${key}`);
};
