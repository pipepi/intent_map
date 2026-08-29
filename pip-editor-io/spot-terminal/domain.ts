import { mergeGraphs, ontologyGraph, refRelation, relationNode } from "../shared/relation-builders.ts";
import { relationProjectionOntology } from "../relation-projections/domain.ts";

export const SPOT_ELEMENT_PLUGIN_ID = "official.spot-terminal-elements";
export const SPOT_NODE_PLUGIN_ID = "official.spot-terminal-types";
export const SPOT_TERMINAL_TYPE = "spot.terminal.type.workspace";
export const SPOT_PROJECTION_DEFINITION = "spot.terminal.projection.workspace";
export const SPOT_FACT_TYPES = ["account", "balance", "pair", "order-book", "daily-summary", "kline", "robot", "order-event", "trade-event"]
  .map((name) => `spot.terminal.type.${name}`);
export const SPOT_PROJECTION_DEFINITIONS = ["workspace", "simple", "children", "world-events", ...["account", "balance", "pair", "order-book", "daily-summary", "kline", "robot", "order-event", "trade-event"].flatMap((kind) => [`${kind}-simple`, `${kind}-detail`])]
  .map((name) => `spot.terminal.projection.${name}`);
export const SPOT_FACT_PREDICATES = ["contains", "fact-value", "account", "pair", "subject", "object"]
  .map((name) => `spot.terminal.predicate.${name}`);
export const SPOT_STATE_PREDICATE = "spot.terminal.predicate.state";
export const SPOT_CONFIG_PREDICATE = "spot.terminal.predicate.config";

export const spotTerminalOntology = mergeGraphs(relationProjectionOntology, ontologyGraph([
  ...[SPOT_TERMINAL_TYPE, ...SPOT_FACT_TYPES].map((id) => relationNode(id, [refRelation("type", "relation.core.type", "relation.core.type")])),
  ...SPOT_PROJECTION_DEFINITIONS.map((id) => relationNode(id)),
  ...SPOT_FACT_PREDICATES.map((id) => relationNode(id)),
  relationNode(SPOT_STATE_PREDICATE),
  relationNode(SPOT_CONFIG_PREDICATE),
]));
