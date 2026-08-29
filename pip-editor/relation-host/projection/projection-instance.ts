/** Generic projection ontology helpers shared by resolution, navigation, and composition. */
import type { Relation, RelationGraph, RelationNode, RelationRef } from "../../relation/index.ts";
import type { ObservationScope, RelationProjection, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import { normalizeProjectionRegistration } from "./projection-context.ts";

export const PROJECTION = {
  instanceType: "relation.projection.type.instance",
  observes: "relation.projection.predicate.observes",
  uses: "relation.projection.predicate.uses",
  divesInto: "relation.projection.predicate.dives-into",
  presents: "relation.projection.predicate.presents",
  childPredicate: "relation.projection.predicate.child-predicate",
  frame: "relation.projection.predicate.frame",
} as const;

const refObject = (relation?: Relation): RelationRef | undefined => relation?.object.kind === "ref" ? relation.object.target : undefined;
export const relationByPredicate = (node: RelationNode | undefined, predicateNodeId: string) =>
  node?.relations.find((relation) => relation.predicate.nodeId === predicateNodeId);
export const relationsByPredicate = (node: RelationNode | undefined, predicateNodeId: string) =>
  node?.relations.filter((relation) => relation.predicate.nodeId === predicateNodeId) ?? [];
export const targetByPredicate = (node: RelationNode | undefined, predicateNodeId: string) =>
  refObject(relationByPredicate(node, predicateNodeId));
export const isProjectionInstance = (node: RelationNode | undefined) =>
  targetByPredicate(node, "relation.core.type")?.nodeId === PROJECTION.instanceType;
export const observedNode = (projection: RelationNode, graph: RelationGraph) =>
  graph.nodes[targetByPredicate(projection, PROJECTION.observes)?.nodeId ?? ""];
export const definitionRef = (projection: RelationNode) => targetByPredicate(projection, PROJECTION.uses);

export const projectionForInstance = (projection: RelationNode, registrations: RelationProjection[]) => {
  const definition = definitionRef(projection);
  return definition && registrations.find((candidate) => candidate.definition?.nodeId === definition.nodeId &&
    candidate.definition.relationId === definition.relationId);
};

export const observationScope = (projection: RelationProjection): ObservationScope =>
  normalizeProjectionRegistration(projection).scope ?? "self";

export type PresentedProjection = { projectionNodeId: string; observedNodeId: string; frame: WorkspaceWindowFrame };
export function presentedProjections(parent: RelationNode, graph: RelationGraph): PresentedProjection[] {
  return relationsByPredicate(parent, PROJECTION.presents).flatMap((relation) => {
    const target = refObject(relation), projection = target && graph.nodes[target.nodeId];
    const observed = projection && targetByPredicate(projection, PROJECTION.observes);
    const frameRelation = relation.relations.find((nested) => nested.predicate.nodeId === PROJECTION.frame);
    const frame = frameRelation?.object.kind === "const" ? frameRelation.object.value : undefined;
    if (!projection || !observed || !frame || typeof frame !== "object" || Array.isArray(frame)) return [];
    return [{ projectionNodeId: projection.id, observedNodeId: observed.nodeId, frame: frame as WorkspaceWindowFrame }];
  });
}
