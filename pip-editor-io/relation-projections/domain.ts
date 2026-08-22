import { mergeGraphs, ontologyGraph, refRelation, relationNode } from "../shared/relation-builders.ts";

export const RELATION_ELEMENT_PLUGIN_ID = "official.relation-projection-elements";
export const RELATION_NODE_PLUGIN_ID = "official.relation-projection-types";
export const PROJECTION_INSTANCE_TYPE = "relation.projection.type.instance";
export const PROJECTION_DEFINITIONS = ["relation.projection.definition.properties", "relation.projection.definition.contains"];
export const PROJECTION_PREDICATES = ["observes", "uses", "dives-into", "presents", "child-predicate", "frame"]
  .map((name) => `relation.projection.predicate.${name}`);

export const relationProjectionOntology = mergeGraphs(ontologyGraph([
  relationNode(PROJECTION_INSTANCE_TYPE, [refRelation("type", "relation.core.type", "relation.core.type")]),
  ...PROJECTION_DEFINITIONS.map((id) => relationNode(id)),
  ...PROJECTION_PREDICATES.map((id) => relationNode(id)),
]));
