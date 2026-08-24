import { mergeGraphs, ontologyGraph, refRelation, relationNode } from "../shared/relation-builders.ts";
import { relationProjectionOntology } from "../relation-projections/domain.ts";

export const SPOT_ELEMENT_PLUGIN_ID = "official.spot-terminal-elements";
export const SPOT_NODE_PLUGIN_ID = "official.spot-terminal-types";
export const SPOT_TERMINAL_TYPE = "spot.terminal.type.workspace";
export const SPOT_PROJECTION_DEFINITION = "spot.terminal.projection.workspace";
export const SPOT_STATE_PREDICATE = "spot.terminal.predicate.state";
export const SPOT_CONFIG_PREDICATE = "spot.terminal.predicate.config";

export const spotTerminalOntology = mergeGraphs(relationProjectionOntology, ontologyGraph([
  relationNode(SPOT_TERMINAL_TYPE, [refRelation("type", "relation.core.type", "relation.core.type")]),
  relationNode(SPOT_PROJECTION_DEFINITION),
  relationNode(SPOT_STATE_PREDICATE),
  relationNode(SPOT_CONFIG_PREDICATE),
]));
