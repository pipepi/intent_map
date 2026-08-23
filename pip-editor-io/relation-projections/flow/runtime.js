import { typeOf } from "./selectors.js";

export const runtimes = [
  {
    id: "relation.flow.state-runtime",
    matches(node) { return typeOf(node) === "relation.flow.type.state"; },
    execute({ inputs, state }) { const next = inputs.value ?? state ?? null; return { outputs: { value: next, snapshot: next }, state: next }; },
  },
  {
    id: "relation.flow.effect-runtime",
    matches(node) { return typeOf(node) === "relation.flow.type.effect"; },
    execute({ inputs }) { return { outputs: { result: inputs.value ?? inputs }, effects: [{ type: "relation.flow.effect", input: inputs }] }; },
  },
  {
    id: "relation.flow.executable-runtime",
    matches(node) { return typeOf(node) === "relation.flow.type.executable"; },
    execute({ inputs }) { return { outputs: { value: inputs.value ?? inputs } }; },
  },
];

export const operators = [
  { id: "identity", evaluate(args) { return args[0] ?? null; } },
  { id: "array", evaluate(args) { return args; } },
  { id: "merge", evaluate(args) { return Object.assign({}, ...args.filter((item) => item && typeof item === "object" && !Array.isArray(item))); } },
];
