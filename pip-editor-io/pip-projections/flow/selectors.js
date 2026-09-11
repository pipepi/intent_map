export const FLOW = Object.freeze({
  input: "pip.flow.predicate.input", output: "pip.flow.predicate.output",
  contains: "pip.flow.predicate.contains", binding: "pip.flow.predicate.binding",
  required: "pip.flow.predicate.required", capacity: "pip.flow.predicate.queue-capacity",
  publicEntry: "pip.flow.predicate.public-entry", delay: "pip.flow.predicate.delay-boundary",
});
export const TRIGGER = Object.freeze({
  target: "pip.trigger.predicate.target", enabled: "pip.trigger.predicate.enabled",
  mapping: "pip.trigger.predicate.input-mapping", configuration: "pip.trigger.predicate.configuration",
  changeDetector: "pip.trigger.predicate.change-detector", overlap: "pip.trigger.predicate.overlap-policy",
});
export const pipBy = (node, predicate) => node?.pips.find((item) => item.predicate_value?.predicate.node_id === predicate);
export const pipsBy = (node, predicate) => node?.pips.filter((item) => item.predicate_value?.predicate.node_id === predicate) ?? [];
export const nestedBy = (pip, predicate) => pip?.pips.find((item) => item.predicate_value?.predicate.node_id === predicate);
export const targetOf = (pip) => pip?.predicate_value?.value.kind === "ref" ? pip.predicate_value.value.target : undefined;
export const constOf = (pip) => pip?.predicate_value?.value.kind === "const" ? pip.predicate_value.value.value : undefined;
export const targetBy = (node, predicate) => targetOf(pipBy(node, predicate));
export const typeOf = (node) => targetBy(node, "pip.core.type")?.node_id;
export const portMeta = (pip) => {
  const value = constOf(pip), source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const nestedRequired = constOf(nestedBy(pip, FLOW.required)), nestedCapacity = constOf(nestedBy(pip, FLOW.capacity));
  return {
    id: pip.id, key: typeof source.key === "string" ? source.key : pip.id,
    label: typeof source.label === "string" ? source.label : pip.id,
    required: typeof nestedRequired === "boolean" ? nestedRequired : source.required !== false,
    queueCapacity: Number.isInteger(nestedCapacity) ? nestedCapacity : Number.isInteger(source.queueCapacity) ? source.queueCapacity : 64,
  };
};
export const bindingOf = (pip) => nestedBy(pip, FLOW.binding)?.predicate_value?.value;
export const flowInputs = (node) => pipsBy(node, FLOW.input);
export const flowOutputs = (node) => pipsBy(node, FLOW.output);
export const flowChildren = (node) => pipsBy(node, FLOW.contains).map(targetOf).filter(Boolean);
