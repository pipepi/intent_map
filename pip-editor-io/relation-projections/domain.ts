import { mergeGraphs, ontologyGraph, refRelation, relationNode } from "../shared/relation-builders.ts";

export const RELATION_ELEMENT_PLUGIN_ID = "official.relation-projection-elements";
export const RELATION_NODE_PLUGIN_ID = "official.relation-projection-types";
export const PROJECTION_INSTANCE_TYPE = "relation.projection.type.instance";
export const PROJECTION_DEFINITIONS = ["relation.projection.definition.properties", "relation.projection.definition.contains", "relation.projection.definition.flow"];
export const PROJECTION_PREDICATES = ["observes", "uses", "dives-into", "presents", "child-predicate", "frame"]
  .map((name) => `relation.projection.predicate.${name}`);

export const relationProjectionOntology = mergeGraphs(ontologyGraph([
  relationNode(PROJECTION_INSTANCE_TYPE, [refRelation("type", "relation.core.type", "relation.core.type")]),
  ...PROJECTION_DEFINITIONS.map((id) => relationNode(id)),
  ...PROJECTION_PREDICATES.map((id) => relationNode(id)),
]));

export const FLOW_TYPES = ["executable", "composite", "state", "effect"].map((name) => `relation.flow.type.${name}`);
export const TRIGGER_TYPES = ["manual", "hook", "schedule", "poll", "custom"].map((name) => `relation.trigger.type.${name}`);
export const EXECUTION_TYPES = ["relation.execution.type.run"];
export const FLOW_PREDICATES = ["input", "output", "contains", "binding", "value-type", "required", "public-entry", "queue-capacity", "delay-boundary"]
  .map((name) => `relation.flow.predicate.${name}`);
export const TRIGGER_PREDICATES = ["target", "enabled", "input-mapping", "configuration", "change-detector", "output-sink", "overlap-policy"]
  .map((name) => `relation.trigger.predicate.${name}`);
export const EXECUTION_PREDICATES = ["target", "status", "graph-revision", "outputs", "trace"]
  .map((name) => `relation.execution.predicate.${name}`);
export const flowOntology = ontologyGraph([
  ...[...FLOW_TYPES, ...TRIGGER_TYPES, ...EXECUTION_TYPES].map((id) => relationNode(id, [refRelation("type", "relation.core.type", "relation.core.type")])),
  ...[...FLOW_PREDICATES, ...TRIGGER_PREDICATES, ...EXECUTION_PREDICATES].map((id) => relationNode(id)),
]);
export const relationFlowOntology = mergeGraphs(relationProjectionOntology, flowOntology);
