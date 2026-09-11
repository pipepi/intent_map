import { typeOf } from "./selectors.js";

export const runtimes = [
  {
    id: "pip.flow.state-runtime",
    matches(node) { return typeOf(node) === "pip.flow.type.state"; },
    execute({ inputs, state }) { const next = inputs.value ?? state ?? null; return { outputs: { value: next, snapshot: next }, state: next }; },
  },
  {
    id: "pip.flow.effect-runtime",
    matches(node) { return typeOf(node) === "pip.flow.type.effect"; },
    execute({ inputs }) { return { outputs: { result: inputs.value ?? inputs }, effects: [{ type: "pip.flow.effect", input: inputs }] }; },
  },
  {
    id: "pip.flow.executable-runtime",
    matches(node) { return typeOf(node) === "pip.flow.type.executable"; },
    execute({ inputs }) { return { outputs: { value: inputs.value ?? inputs } }; },
  },
];

export const operators = [
  { id: "identity", evaluate(args) { return args[0] ?? null; } },
  { id: "array", evaluate(args) { return args; } },
  { id: "merge", evaluate(args) { return Object.assign({}, ...args.filter((item) => item && typeof item === "object" && !Array.isArray(item))); } },
];
