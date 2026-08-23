export const FLOW = Object.freeze({
  input: "relation.flow.predicate.input", output: "relation.flow.predicate.output",
  contains: "relation.flow.predicate.contains", binding: "relation.flow.predicate.binding",
  required: "relation.flow.predicate.required", capacity: "relation.flow.predicate.queue-capacity",
  publicEntry: "relation.flow.predicate.public-entry", delay: "relation.flow.predicate.delay-boundary",
});
export const TRIGGER = Object.freeze({
  target: "relation.trigger.predicate.target", enabled: "relation.trigger.predicate.enabled",
  mapping: "relation.trigger.predicate.input-mapping", configuration: "relation.trigger.predicate.configuration",
  changeDetector: "relation.trigger.predicate.change-detector", overlap: "relation.trigger.predicate.overlap-policy",
});
export const relationBy = (node, predicate) => node?.relations.find((item) => item.predicate.nodeId === predicate);
export const relationsBy = (node, predicate) => node?.relations.filter((item) => item.predicate.nodeId === predicate) ?? [];
export const nestedBy = (relation, predicate) => relation?.relations.find((item) => item.predicate.nodeId === predicate);
export const targetOf = (relation) => relation?.object.kind === "ref" ? relation.object.target : undefined;
export const constOf = (relation) => relation?.object.kind === "const" ? relation.object.value : undefined;
export const targetBy = (node, predicate) => targetOf(relationBy(node, predicate));
export const typeOf = (node) => targetBy(node, "relation.core.type")?.nodeId;
export const portMeta = (relation) => {
  const value = constOf(relation), source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const nestedRequired = constOf(nestedBy(relation, FLOW.required)), nestedCapacity = constOf(nestedBy(relation, FLOW.capacity));
  return {
    id: relation.id, key: typeof source.key === "string" ? source.key : relation.id,
    label: typeof source.label === "string" ? source.label : relation.id,
    required: typeof nestedRequired === "boolean" ? nestedRequired : source.required !== false,
    queueCapacity: Number.isInteger(nestedCapacity) ? nestedCapacity : Number.isInteger(source.queueCapacity) ? source.queueCapacity : 64,
  };
};
export const bindingOf = (relation) => nestedBy(relation, FLOW.binding)?.object;
export const flowInputs = (node) => relationsBy(node, FLOW.input);
export const flowOutputs = (node) => relationsBy(node, FLOW.output);
export const flowChildren = (node) => relationsBy(node, FLOW.contains).map(targetOf).filter(Boolean);
