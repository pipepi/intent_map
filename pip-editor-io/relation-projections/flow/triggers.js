import { TRIGGER, constOf, relationBy, targetBy, typeOf } from "./selectors.js";

const mapping = (trigger, payload) => {
  const configured = constOf(relationBy(trigger, TRIGGER.mapping));
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) return payload;
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { value: payload };
  return Object.fromEntries(Object.entries(configured).map(([port, key]) => [port, source[String(key)] ?? null]));
};
export const triggerProviders = ["manual", "hook", "schedule", "poll", "custom"].map((kind) => ({
  id: `relation.trigger.${kind}`,
  matches(trigger) { return typeOf(trigger) === `relation.trigger.type.${kind}`; },
  target(trigger) { const target = targetBy(trigger, TRIGGER.target); if (!target) throw new Error(`Trigger ${trigger.id} has no target`); return target; },
  mapInput(trigger, payload) { return mapping(trigger, payload); },
  activation(trigger) {
    if (constOf(relationBy(trigger, TRIGGER.enabled)) === false || kind === "manual" || kind === "custom") return;
    const config = constOf(relationBy(trigger, TRIGGER.configuration)) ?? {};
    if (kind === "hook") return { kind: "hook", key: String(config.key ?? trigger.id) };
    const intervalMs = Math.max(250, Number(config.intervalMs) || 60_000);
    return { kind, intervalMs, payload: config.payload ?? {} };
  },
}));
