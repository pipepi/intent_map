/** Builds persistent projection instances; semantic zoom only changes which instance is active. */
import type { RelationNode } from "../../pip-editor/relation/index.ts";
import { constRelation, refRelation, relationNode } from "../shared/relation-builders.ts";

const P = (name: string) => `relation.projection.predicate.${name}`;
const selfId = (nodeId: string) => `scene.view.properties:${nodeId}`;
const childrenId = (nodeId: string) => `scene.view.children:${nodeId}`;
const frame = (index: number) => ({ x: 24 + index % 4 * 256, y: 54 + Math.floor(index / 4) * 136, width: 232, height: 116, resizeMode: "simple" });

const childrenOf = (node: RelationNode, predicate: string) => node.relations.flatMap((relation) =>
  relation.predicate.nodeId === predicate && relation.object.kind === "ref" ? [relation.object.target.nodeId] : []);
const instanceBase = (observedId: string, definitionId: string) => [
  refRelation("type", "relation.core.type", "relation.projection.type.instance"),
  refRelation("observes", P("observes"), observedId), refRelation("uses", P("uses"), definitionId),
];

export function buildProjectionBundle(businessNodes: RelationNode[], containsPredicate: string) {
  const nodes: RelationNode[] = [];
  for (const business of businessNodes) {
    nodes.push(relationNode(selfId(business.id), [
      ...instanceBase(business.id, "relation.projection.definition.properties"),
      refRelation("dives-into", P("dives-into"), childrenId(business.id)),
    ]));
    nodes.push(relationNode(childrenId(business.id), [
      ...instanceBase(business.id, "relation.projection.definition.contains"),
      refRelation("child-predicate", P("child-predicate"), containsPredicate),
      ...childrenOf(business, containsPredicate).map((childId, index) => refRelation(
        `presents:${index}`, P("presents"), selfId(childId), "identity", [constRelation(`frame:${index}`, P("frame"), frame(index))],
      )),
    ]));
  }
  const todayInternal = childrenId("scene.today");
  nodes.push(relationNode("scene.view.quadrant", [
    ...instanceBase("scene.today", "scene.projection.quadrant"), refRelation("dives-into", P("dives-into"), todayInternal),
    constRelation("camera", "scene.predicate.camera", { zRotation: 135, yAxisLength: 300, zAxisLength: 300, xZoom: 1, xPan: 0 }),
  ]));
  nodes.push(relationNode("scene.view.tube", [
    ...instanceBase("scene.today", "scene.projection.tube"), refRelation("dives-into", P("dives-into"), todayInternal),
    constRelation("camera", "scene.predicate.camera", { xZoom: 1, xPan: 0 }),
  ]));
  return { nodes, selfId, childrenId };
}
