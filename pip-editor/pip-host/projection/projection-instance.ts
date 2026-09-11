import { graphNodes } from "../../pip/pip-model.ts";
/** Generic projection ontology helpers shared by resolution, navigation, and composition. */
import type { Pip, PipRef } from "../../pip/index.ts";
import type { ObservationScope, PipProjection, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import { normalizeProjectionRegistration } from "./projection-context.ts";

export const PROJECTION = {
  instanceType: "pip.projection.type.instance",
  observes: "pip.projection.predicate.observes",
  uses: "pip.projection.predicate.uses",
  divesInto: "pip.projection.predicate.dives-into",
  presents: "pip.projection.predicate.presents",
  childPredicate: "pip.projection.predicate.child-predicate",
  frame: "pip.projection.predicate.frame",
} as const;

const refObject = (pip?: Pip): PipRef | undefined => pip?.predicate_value?.value.kind === "ref" ? pip.predicate_value!.value.target : undefined;
export const pipByPredicate = (node: Pip | undefined, predicateNodeId: string) =>
  node?.pips.find((pip) => pip.predicate_value?.predicate.node_id === predicateNodeId);
export const pipsByPredicate = (node: Pip | undefined, predicateNodeId: string) =>
  node?.pips.filter((pip) => pip.predicate_value?.predicate.node_id === predicateNodeId) ?? [];
export const targetByPredicate = (node: Pip | undefined, predicateNodeId: string) =>
  refObject(pipByPredicate(node, predicateNodeId));
export const isProjectionInstance = (node: Pip | undefined) =>
  targetByPredicate(node, "pip.core.type")?.node_id === PROJECTION.instanceType;
export const observedNode = (projection: Pip, graph: Pip) => graphNodes(graph)[targetByPredicate(projection, PROJECTION.observes)?.node_id ?? ""];
export const definitionRef = (projection: Pip) => targetByPredicate(projection, PROJECTION.uses);

export const projectionForInstance = (projection: Pip, registrations: PipProjection[]) => {
  const definition = definitionRef(projection);
  return definition && registrations.find((candidate) => candidate.definition?.node_id === definition.node_id &&
    candidate.definition.pip_id === definition.pip_id);
};

export const observationScope = (projection: PipProjection): ObservationScope =>
  normalizeProjectionRegistration(projection).scope ?? "self";

export type PresentedProjection = { projectionNodeId: string; observedNodeId: string; frame: WorkspaceWindowFrame };
export function presentedProjections(parent: Pip, graph: Pip): PresentedProjection[] {
  return pipsByPredicate(parent, PROJECTION.presents).flatMap((pip) => {
    const target = refObject(pip), projection = target && graphNodes(graph)[target.node_id];
    const observed = projection && targetByPredicate(projection, PROJECTION.observes);
    const frame_pip = pip.pips.find((nested) => nested.predicate_value?.predicate.node_id === PROJECTION.frame);
    const frame = frame_pip?.predicate_value?.value.kind === "const" ? frame_pip.predicate_value!.value.value : undefined;
    if (!projection || !observed || !frame || typeof frame !== "object" || Array.isArray(frame)) return [];
    return [{ projectionNodeId: projection.id, observedNodeId: observed.node_id, frame: frame as WorkspaceWindowFrame }];
  });
}
