import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { target } from "./selectors.js";

const pips = (node, predicate) => node?.pips.filter((item) => item.predicate_value?.predicate.node_id === predicate) ?? [];
const definition = (node) => target(node, "pip.projection.predicate.uses")?.node_id;
const observed_id = (node) => target(node, "pip.projection.predicate.observes")?.node_id;

export function validate_spot_projections(graph) {
  const projections = Object.values(graphNodes(graph)).filter((node) => target(node, "pip.core.type")?.node_id === "pip.projection.type.instance");
  for (const projection of projections) {
    const projection_definition = definition(projection);
    if (!["spot.terminal.projection.children", "spot.terminal.projection.world-events"].includes(projection_definition)) continue;
    const terminal = graphNodes(graph)[observed_id(projection)];
    const child_ids = pips(terminal, "spot.terminal.predicate.contains").map((item) => item.predicate_value.value.kind === "ref" && item.predicate_value.value.target.node_id).filter(Boolean);
    const presented = pips(projection, "pip.projection.predicate.presents");
    const presented_ids = presented.map((item) => item.predicate_value.value.kind === "ref" && graphNodes(graph)[item.predicate_value.value.target.node_id]).map((item) => item && observed_id(item)).filter(Boolean);
    if (child_ids.length !== presented_ids.length || child_ids.some((id) => !presented_ids.includes(id))) throw new Error(`Spot children projection ${projection.id} does not mirror terminal facts`);
        for (const pip of presented) {
            const child_projection = pip.predicate_value.value.kind === "ref" && graphNodes(graph)[pip.predicate_value.value.target.node_id];
            const child = child_projection && graphNodes(graph)[observed_id(child_projection)];
            const kind = target(child, "pip.core.type")?.node_id.replace("spot.terminal.type.", "");
            if (!child_projection || definition(child_projection) !== `spot.terminal.projection.${kind}-simple`)
                throw new Error(`Spot children projection ${projection.id} must present the Child Simple instance`);
            const frame = pip.pips.find((item) => item.predicate_value?.predicate.node_id === "pip.projection.predicate.frame");
            if (frame?.predicate_value?.value.kind !== "const")
                throw new Error(`Spot children projection ${projection.id} presents a fact without a frame`);
        }
    }
    for (const terminal of Object.values(graphNodes(graph)).filter((node) => target(node, "pip.core.type")?.node_id === "spot.terminal.type.workspace")) {
        const own = projections.filter((node) => observed_id(node) === terminal.id), flow = own.find((node) => definition(node) === "spot.terminal.projection.children");
        for (const self of own.filter((node) => ["spot.terminal.projection.workspace", "spot.terminal.projection.simple"].includes(definition(node)))) {
            if (!flow || target(self, "pip.projection.predicate.dives-into")?.node_id !== flow.id)
                throw new Error(`Spot self projection ${self.id} must dive into its Flow instance`);
        }
    }
}
