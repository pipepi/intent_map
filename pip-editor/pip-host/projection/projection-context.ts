import type { ObservationScope, ProjectionContext, ProjectionContextInput, ProjectionContextKind, ProjectionSurface, PipProjection } from "../contracts/package-types.ts";

const validKinds = new Set<ProjectionContextKind>(["self-workspace", "children-workspace", "self-embedded"]);

const legacyCapabilities = (contexts: ProjectionContextKind[]): { scope: ObservationScope; surfaces: ProjectionSurface[] } => {
  if (contexts.some((kind) => !validKinds.has(kind))) throw new Error("invalid context");
  if (contexts.includes("children-workspace") && contexts.some((kind) => kind !== "children-workspace")) throw new Error("cannot combine children-workspace with a self context");
  if (contexts.includes("self-embedded") && !contexts.includes("self-workspace")) throw new Error("must support self-workspace before self-embedded");
  return contexts.includes("children-workspace")
    ? { scope: "children", surfaces: ["workspace"] }
    : { scope: "self", surfaces: contexts.includes("self-embedded") ? ["workspace", "embedded"] : ["workspace"] };
};

const contextsFor = (scope: ObservationScope, surfaces: ProjectionSurface[]): ProjectionContextKind[] =>
  scope === "children" ? ["children-workspace"] : ["self-workspace", ...(surfaces.includes("embedded") ? ["self-embedded" as const] : [])];

export function normalizeProjectionRegistration(projection: PipProjection): PipProjection {
  if (projection.zoomViewport && Object.values(projection.zoomViewport).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Projection ${projection.id} has an invalid zoom viewport`);
  }
  if (!projection.definition && !projection.contexts?.length && !projection.scope && !projection.surfaces?.length) return projection;
  let legacy: { scope: ObservationScope; surfaces: ProjectionSurface[] } | undefined;
  try { if (projection.contexts?.length) legacy = legacyCapabilities(projection.contexts); }
  catch (error) { throw new Error(`Projection ${projection.id} ${error instanceof Error ? error.message : "has invalid contexts"}`); }
  const scope = projection.scope ?? legacy?.scope;
  const surfaces = projection.surfaces ?? legacy?.surfaces;
  if (!scope || !["self", "children"].includes(scope)) throw new Error(`Projection ${projection.id} has an invalid observation scope`);
  if (!surfaces?.length || surfaces.some((surface) => !["workspace", "embedded"].includes(surface))) throw new Error(`Projection ${projection.id} has invalid surfaces`);
  const uniqueSurfaces = [...new Set(surfaces)];
  if (scope === "children" && uniqueSurfaces.includes("embedded")) throw new Error(`Projection ${projection.id} cannot combine children scope with embedded surface`);
  if (uniqueSurfaces.includes("embedded") && !uniqueSurfaces.includes("workspace")) throw new Error(`Projection ${projection.id} must support workspace before embedded`);
  if (legacy && (legacy.scope !== scope || legacy.surfaces.length !== uniqueSurfaces.length || legacy.surfaces.some((surface) => !uniqueSurfaces.includes(surface)))) {
    throw new Error(`Projection ${projection.id} has conflicting contexts and scope/surfaces`);
  }
  return { ...projection, scope, surfaces: uniqueSurfaces, contexts: contextsFor(scope, uniqueSurfaces) };
}

export function assertProjectionRegistration(projection: PipProjection) { normalizeProjectionRegistration(projection); }

export function normalizeProjectionContext(context: ProjectionContextInput): ProjectionContext {
  if (context.kind === "self-embedded") return { ...context, scope: "self", surface: "embedded", kind: context.kind };
  if (context.kind === "children-workspace") return { scope: "children", surface: "workspace", kind: context.kind };
  return { scope: "self", surface: "workspace", kind: context.kind };
}

export function workspaceProjectionContext(scope: ObservationScope): ProjectionContext {
  return scope === "children"
    ? { scope, surface: "workspace", kind: "children-workspace" }
    : { scope, surface: "workspace", kind: "self-workspace" };
}

export function assertProjectionContext(projection: PipProjection, context: ProjectionContext) {
  const normalized = normalizeProjectionRegistration(projection);
  if (normalized.scope !== context.scope || !normalized.surfaces?.includes(context.surface)) {
    throw new Error(`Projection ${projection.id} does not support ${context.kind}`);
  }
}
