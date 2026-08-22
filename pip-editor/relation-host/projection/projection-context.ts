import type { ProjectionContext, ProjectionContextKind, RelationProjection } from "../contracts/package-types.ts";

const validKinds = new Set<ProjectionContextKind>(["self-workspace", "children-workspace", "self-embedded"]);

/** Rejects the missing fourth Cartesian combination by validating a closed context vocabulary. */
export function assertProjectionRegistration(projection: RelationProjection) {
  if (!projection.definition || !projection.contexts?.length) return;
  if (projection.contexts.some((kind) => !validKinds.has(kind))) throw new Error(`Projection ${projection.id} has an invalid context`);
  if (projection.contexts.includes("children-workspace") && projection.contexts.includes("self-embedded")) {
    throw new Error(`Projection ${projection.id} cannot combine children-workspace with self-embedded`);
  }
  if (projection.contexts.includes("self-embedded") && !projection.contexts.includes("self-workspace")) {
    throw new Error(`Projection ${projection.id} must support self-workspace before self-embedded`);
  }
}

export function assertProjectionContext(projection: RelationProjection, context: ProjectionContext) {
  if (!projection.contexts?.includes(context.kind)) throw new Error(`Projection ${projection.id} does not support ${context.kind}`);
}
