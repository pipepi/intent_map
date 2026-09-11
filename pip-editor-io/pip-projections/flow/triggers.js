import { TRIGGER, constOf, pipBy, targetBy, typeOf } from "./selectors.js";

const mapping = (trigger, payload) => {
  const configured = constOf(pipBy(trigger, TRIGGER.mapping));
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) return payload;
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { value: payload };
  return Object.fromEntries(Object.entries(configured).map(([port, key]) => [port, source[String(key)] ?? null]));
};
export const triggerProviders = ["manual", "hook", "schedule", "poll", "custom"].map((kind) => ({
  id: `pip.trigger.${kind}`,
  matches(trigger) { return typeOf(trigger) === `pip.trigger.type.${kind}`; },
  target(trigger) { const target = targetBy(trigger, TRIGGER.target); if (!target) throw new Error(`Trigger ${trigger.id} has no target`); return target; },
  mapInput(trigger, payload) { return mapping(trigger, payload); },
  activation(trigger) {
    if (constOf(pipBy(trigger, TRIGGER.enabled)) === false || kind === "manual" || kind === "custom") return;
    const config = constOf(pipBy(trigger, TRIGGER.configuration)) ?? {};
    if (kind === "hook") return { kind: "hook", key: String(config.key ?? trigger.id) };
    const intervalMs = Math.max(250, Number(config.intervalMs) || 60_000);
    return { kind, intervalMs, payload: config.payload ?? {} };
  },
}));
