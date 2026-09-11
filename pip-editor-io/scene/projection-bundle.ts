/** Builds persistent projection instances; semantic zoom only changes which instance is active. */
import type { Pip } from "../../pip-editor/pip/index.ts";
import { constPip, refPip, pipNode } from "../shared/pip-builders.ts";

const P = (name: string) => `pip.projection.predicate.${name}`;
const selfId = (nodeId: string) => `scene.view.properties:${nodeId}`;
const childrenId = (nodeId: string) => `scene.view.children:${nodeId}`;
const frame = (index: number) => ({ x: 24 + index % 4 * 256, y: 54 + Math.floor(index / 4) * 136, width: 232, height: 116, resizeMode: "simple" });
const childrenOf = (node: Pip, predicate: string) => node.pips.flatMap((pip) => pip.predicate_value?.predicate.node_id === predicate && pip.predicate_value!.value.kind === "ref" ? [pip.predicate_value!.value.target.node_id] : []);
const instanceBase = (observedId: string, definitionId: string) => [
  refPip("type", "pip.core.type", "pip.projection.type.instance"),
  refPip("observes", P("observes"), observedId), refPip("uses", P("uses"), definitionId),
];
export function buildProjectionBundle(businessNodes: Pip[], containsPredicate: string) {
    const nodes: Pip[] = [];
    for (const business of businessNodes) {
        nodes.push(pipNode(selfId(business.id), [
      ...instanceBase(business.id, "pip.projection.definition.properties"),
      refPip("dives-into", P("dives-into"), childrenId(business.id)),
    ]));
        nodes.push(pipNode(childrenId(business.id), [
      ...instanceBase(business.id, "pip.projection.definition.contains"),
      refPip("child-predicate", P("child-predicate"), containsPredicate),
      ...childrenOf(business, containsPredicate).map((childId, index) => refPip(
        `presents:${index}`, P("presents"), selfId(childId), "identity", [constPip(`frame:${index}`, P("frame"), frame(index))],
      )),
    ]));
    }
    const todayInternal = childrenId("scene.today");
    nodes.push(pipNode("scene.view.quadrant", [
    ...instanceBase("scene.today", "scene.projection.quadrant"), refPip("dives-into", P("dives-into"), todayInternal),
    constPip("camera", "scene.predicate.camera", { zRotation: 135, yAxisLength: 300, zAxisLength: 300, xZoom: 1, xPan: 0 }),
  ]));
    nodes.push(pipNode("scene.view.tube", [
    ...instanceBase("scene.today", "scene.projection.tube"), refPip("dives-into", P("dives-into"), todayInternal),
    constPip("camera", "scene.predicate.camera", { xZoom: 1, xPan: 0 }),
  ]));
    return { nodes, selfId, childrenId };
}
