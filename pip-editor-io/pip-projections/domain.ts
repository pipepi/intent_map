import { mergeGraphs, ontologyGraph, refPip, pipNode } from "../shared/pip-builders.ts";

export const PIP_ELEMENT_PLUGIN_ID = "official.pip-projection-elements";
export const PIP_NODE_PLUGIN_ID = "official.pip-projection-types";
export const PROJECTION_INSTANCE_TYPE = "pip.projection.type.instance";
export const PROJECTION_DEFINITIONS = ["pip.projection.definition.properties", "pip.projection.definition.contains", "pip.projection.definition.flow"];
export const PROJECTION_PREDICATES = ["observes", "uses", "dives-into", "presents", "child-predicate", "frame"]
  .map((name) => `pip.projection.predicate.${name}`);

export const pipProjectionOntology = mergeGraphs(ontologyGraph([
  pipNode(PROJECTION_INSTANCE_TYPE, [refPip("type", "pip.core.type", "pip.core.type")]),
  ...PROJECTION_DEFINITIONS.map((id) => pipNode(id)),
  ...PROJECTION_PREDICATES.map((id) => pipNode(id)),
]));

export const FLOW_TYPES = ["executable", "composite", "state", "effect"].map((name) => `pip.flow.type.${name}`);
export const TRIGGER_TYPES = ["manual", "hook", "schedule", "poll", "custom"].map((name) => `pip.trigger.type.${name}`);
export const EXECUTION_TYPES = ["pip.execution.type.run"];
export const FLOW_PREDICATES = ["input", "output", "contains", "binding", "value-type", "required", "public-entry", "queue-capacity", "delay-boundary"]
  .map((name) => `pip.flow.predicate.${name}`);
export const TRIGGER_PREDICATES = ["target", "enabled", "input-mapping", "configuration", "change-detector", "output-sink", "overlap-policy"]
  .map((name) => `pip.trigger.predicate.${name}`);
export const EXECUTION_PREDICATES = ["target", "status", "graph-revision", "outputs", "trace"]
  .map((name) => `pip.execution.predicate.${name}`);
export const flowOntology = ontologyGraph([
  ...[...FLOW_TYPES, ...TRIGGER_TYPES, ...EXECUTION_TYPES].map((id) => pipNode(id, [refPip("type", "pip.core.type", "pip.core.type")])),
  ...[...FLOW_PREDICATES, ...TRIGGER_PREDICATES, ...EXECUTION_PREDICATES].map((id) => pipNode(id)),
]);
export const pipFlowOntology = mergeGraphs(pipProjectionOntology, flowOntology);
