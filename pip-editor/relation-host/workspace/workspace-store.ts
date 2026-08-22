/** Commits validated patches, publishes immutable workspace snapshots, and maintains undo/redo. */
import { applyRelationPatch, type JsonValue, type RelationPatch } from "../../relation/index.ts";
import type { RelationWorkspace } from "../packages/node-map-package.ts";
import type { ExactPackageRef, RelationCreationResult, RelationValidator, WorkspacePoint, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import { assertWorkspaceFrame, normalizeFreeLayout, withSystemWindows } from "./view-state.ts";

export type CapabilityDiagnostic = {
  dependencyKind: "element" | "node-type";
  dependency: ExactPackageRef;
  stage: "resolve" | "activate";
  message: string;
};

export type WorkspaceSession = RelationWorkspace & {
  undo: WorkspaceHistoryEntry[];
  redo: WorkspaceHistoryEntry[];
  capabilityDiagnostics: CapabilityDiagnostic[];
  savedGraphFingerprint: string;
};
export type WorkspaceHistoryEntry = { patch: RelationPatch; rootNodeIds?: string[]; projectionFrames?: Record<string, WorkspaceWindowFrame> };

export type WorkspaceHistoryDirection = "undo" | "redo";

export class WorkspaceSessionStore {
  #value: WorkspaceSession[];
  readonly #publish: (workspaces: WorkspaceSession[]) => void;

  constructor(initial: WorkspaceSession[], publish: (workspaces: WorkspaceSession[]) => void) {
    this.#value = initial;
    this.#publish = publish;
  }

  list() { return this.#value; }

  #replace(next: WorkspaceSession[]) {
    this.#value = next;
    this.#publish(next);
  }

  add(workspace: WorkspaceSession) {
    this.#replace([...this.#value, workspace]);
  }

  replace(workspaceId: string, workspace: WorkspaceSession) {
    if (!this.#value.some((item) => item.id === workspaceId)) throw new Error(`Unknown workspace ${workspaceId}`);
    this.#replace(this.#value.map((item) => item.id === workspaceId ? workspace : item));
  }

  markSaved(workspaceId: string) {
    const workspace = this.#workspace(workspaceId), savedGraphFingerprint = graphFingerprint(workspace.graph);
    this.#replace(this.#value.map((item) => item.id === workspaceId ? { ...item, savedGraphFingerprint } : item));
  }

  remove(workspaceId: string) { this.#replace(this.#value.filter((item) => item.id !== workspaceId)); }

  reorder(workspaceId: string, beforeId?: string) {
    const moving = this.#value.find((item) => item.id === workspaceId);
    if (!moving) return;
    const rest = this.#value.filter((item) => item.id !== workspaceId);
    const index = beforeId ? rest.findIndex((item) => item.id === beforeId) : -1;
    rest.splice(index < 0 ? rest.length : index, 0, moving); this.#replace(rest);
  }

  updateViews(workspaceId: string, views: JsonValue) {
    const workspace = this.#workspace(workspaceId), copy = structuredClone(views);
    JSON.stringify(copy);
    this.#replace(this.#value.map((item) => item.id === workspaceId ? { ...workspace, views: copy } : item));
  }

  setWindow(workspaceId: string, windowId: string, frame: WorkspaceWindowFrame) {
    const workspace = this.#workspace(workspaceId), views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    assertWorkspaceFrame(frame, views.world);
    if (views.projections[windowId]) views.projections[windowId] = structuredClone(frame);
    else if (views.systemWindows[windowId]) {
      views.systemWindows[windowId].frame = structuredClone(frame);
      if ((workspace.views as { kind?: unknown })?.kind !== "free-layout") return void this.updateViews(workspaceId, withSystemWindows(workspace.views, views.systemWindows, views.activeWindowId));
    }
    else throw new Error(`Unknown workspace window ${windowId}`);
    this.updateViews(workspaceId, views);
  }

  activateWindow(workspaceId: string, windowId: string) {
    const workspace = this.#workspace(workspaceId), views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    if (!views.projections[windowId] && !views.systemWindows[windowId]) throw new Error(`Unknown workspace window ${windowId}`);
    if (views.activeWindowId === windowId) return;
    views.activeWindowId = windowId;
    this.updateViews(workspaceId, (workspace.views as { kind?: unknown })?.kind === "free-layout"
      ? views : withSystemWindows(workspace.views, views.systemWindows, windowId));
  }

  openPluginManager(workspaceId: string, point: WorkspacePoint) {
    const workspace = this.#workspace(workspaceId), views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    const width = 640, height = 720;
    const x = Math.max(0, Math.min(views.world.width - width, point.x)), y = Math.max(0, Math.min(views.world.height - height, point.y));
    views.systemWindows["host.plugin-manager"] = { id: "host.plugin-manager", type: "plugin-manager", frame: { x, y, width, height, resizeMode: "full" } };
    views.activeWindowId = "host.plugin-manager";
    this.updateViews(workspaceId, (workspace.views as { kind?: unknown })?.kind === "free-layout" ? views : withSystemWindows(workspace.views, views.systemWindows, views.activeWindowId));
  }

  closeSystemWindow(workspaceId: string, windowId: string) {
    const workspace = this.#workspace(workspaceId), views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    delete views.systemWindows[windowId];
    if (views.activeWindowId === windowId) views.activeWindowId = undefined;
    this.updateViews(workspaceId, (workspace.views as { kind?: unknown })?.kind === "free-layout" ? views : withSystemWindows(workspace.views, views.systemWindows, views.activeWindowId));
  }

  setDiagnostics(workspaceId: string, diagnostics: CapabilityDiagnostic[]) {
    this.#replace(this.#value.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, capabilityDiagnostics: [...diagnostics] }
      : workspace));
  }

  select(workspaceId: string, nodeIds: unknown, scopeId?: string) {
    const workspace = this.#value.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);
    if (!Array.isArray(nodeIds) || nodeIds.some((id) => typeof id !== "string" || !workspace.graph.nodes[id])) {
      throw new Error("Selection contains an unknown RelationNode");
    }
    const selection = [...new Set(nodeIds as string[])];
    if (scopeId && !workspace.rootNodeIds.includes(scopeId)) throw new Error("Selection scope is not a workspace root");
    this.#replace(this.#value.map((item) => item.id === workspaceId
      ? scopeId
        ? { ...item, scopedSelections: { ...item.scopedSelections, [scopeId]: selection } }
        : { ...item, selection }
      : item));
  }

  commitPatch(workspaceId: string, patch: RelationPatch, validators: RelationValidator[], recordHistory = true) {
    const workspace = this.#workspace(workspaceId);
    const applied = applyRelationPatch(workspace.graph, patch);
    validators.forEach((validate) => validate(applied.graph));
    const next = {
      ...workspace,
      graph: applied.graph,
      undo: recordHistory ? [...workspace.undo, { patch: applied.inverse }] : workspace.undo,
      redo: recordHistory ? [] : workspace.redo,
    };
    this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
  }

  commitCreation(workspaceId: string, result: RelationCreationResult, point: WorkspacePoint, validators: RelationValidator[]) {
    const workspace = this.#workspace(workspaceId), applied = applyRelationPatch(workspace.graph, result.patch);
    validators.forEach((validate) => validate(applied.graph));
    const roots = [...new Set([...workspace.rootNodeIds, ...(result.addRootNodeIds ?? [])])];
    roots.forEach((id) => { if (!applied.graph.nodes[id]) throw new Error(`Creator returned unknown root ${id}`); });
    const views = normalizeFreeLayout(workspace.views, roots);
    if (result.preferredProjection) {
      const id = result.preferredProjection.projectionId;
      if (!roots.includes(id)) throw new Error(`Creator projection ${id} is not a root`);
      const width = result.preferredProjection.width, height = result.preferredProjection.height;
      const frame = { x: Math.max(0, Math.min(views.world.width - width, point.x)), y: Math.max(0, Math.min(views.world.height - height, point.y)), width, height, resizeMode: "simple" as const };
      assertWorkspaceFrame(frame, views.world); views.projections[id] = frame; views.activeWindowId = id;
    }
    const undo = { patch: applied.inverse, rootNodeIds: [...workspace.rootNodeIds] };
    const next = { ...workspace, graph: applied.graph, rootNodeIds: roots, views, undo: [...workspace.undo, undo], redo: [] };
    this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
  }

  history(workspaceId: string, direction: WorkspaceHistoryDirection, validators: RelationValidator[]) {
    const workspace = this.#workspace(workspaceId);
    const stack = direction === "undo" ? workspace.undo : workspace.redo;
    const patch = stack.at(-1);
    if (!patch) return;
    const applied = applyRelationPatch(workspace.graph, patch.patch);
    validators.forEach((validate) => validate(applied.graph));
    const currentViews = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    const inverse: WorkspaceHistoryEntry = { patch: applied.inverse };
    if (patch.rootNodeIds) { inverse.rootNodeIds = [...workspace.rootNodeIds]; inverse.projectionFrames = structuredClone(currentViews.projections); }
    const rootNodeIds = patch.rootNodeIds ? [...patch.rootNodeIds] : workspace.rootNodeIds;
    let views = workspace.views;
    if (patch.rootNodeIds) {
      const freeViews = normalizeFreeLayout(workspace.views, rootNodeIds);
      if (patch.projectionFrames) for (const id of rootNodeIds) if (patch.projectionFrames[id]) freeViews.projections[id] = structuredClone(patch.projectionFrames[id]);
      views = freeViews;
    }
    const restored = { graph: applied.graph, rootNodeIds, views };
    const next = direction === "undo"
      ? { ...workspace, ...restored, undo: stack.slice(0, -1), redo: [...workspace.redo, inverse] }
      : { ...workspace, ...restored, redo: stack.slice(0, -1), undo: [...workspace.undo, inverse] };
    this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
  }

  #workspace(workspaceId: string) {
    const workspace = this.#value.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);
    return workspace;
  }
}

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)])) : value;
export const graphFingerprint = (graph: WorkspaceSession["graph"]) => JSON.stringify(canonical(graph.nodes));
