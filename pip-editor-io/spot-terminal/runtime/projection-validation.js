import { target } from "./selectors.js";

const relations = (node, predicate) => node?.relations.filter((item) => item.predicate.nodeId === predicate) ?? [];
const definition = (node) => target(node, "relation.projection.predicate.uses")?.nodeId;
const observed_id = (node) => target(node, "relation.projection.predicate.observes")?.nodeId;

export function validate_spot_projections(graph) {
  const projections = Object.values(graph.nodes).filter((node) => target(node, "relation.core.type")?.nodeId === "relation.projection.type.instance");
  for (const projection of projections) {
    const projection_definition = definition(projection);
    if (!["spot.terminal.projection.children", "spot.terminal.projection.world-events"].includes(projection_definition)) continue;
    const terminal = graph.nodes[observed_id(projection)];
    const child_ids = relations(terminal, "spot.terminal.predicate.contains").map((item) => item.object.kind === "ref" && item.object.target.nodeId).filter(Boolean);
    const presented = relations(projection, "relation.projection.predicate.presents");
    const presented_ids = presented.map((item) => item.object.kind === "ref" && graph.nodes[item.object.target.nodeId]).map((item) => item && observed_id(item)).filter(Boolean);
    if (child_ids.length !== presented_ids.length || child_ids.some((id) => !presented_ids.includes(id))) throw new Error(`Spot children projection ${projection.id} does not mirror terminal facts`);
    for (const relation of presented) {
      const child_projection = relation.object.kind === "ref" && graph.nodes[relation.object.target.nodeId];
      const child = child_projection && graph.nodes[observed_id(child_projection)];
      const kind = target(child, "relation.core.type")?.nodeId.replace("spot.terminal.type.", "");
      if (!child_projection || definition(child_projection) !== `spot.terminal.projection.${kind}-simple`) throw new Error(`Spot children projection ${projection.id} must present the Child Simple instance`);
      const frame = relation.relations.find((item) => item.predicate.nodeId === "relation.projection.predicate.frame");
      if (frame?.object.kind !== "const") throw new Error(`Spot children projection ${projection.id} presents a fact without a frame`);
    }
  }
  for (const terminal of Object.values(graph.nodes).filter((node) => target(node, "relation.core.type")?.nodeId === "spot.terminal.type.workspace")) {
    const own = projections.filter((node) => observed_id(node) === terminal.id), flow = own.find((node) => definition(node) === "spot.terminal.projection.children");
    for (const self of own.filter((node) => ["spot.terminal.projection.workspace", "spot.terminal.projection.simple"].includes(definition(node)))) {
      if (!flow || target(self, "relation.projection.predicate.dives-into")?.nodeId !== flow.id) throw new Error(`Spot self projection ${self.id} must dive into its Flow instance`);
    }
  }
}
