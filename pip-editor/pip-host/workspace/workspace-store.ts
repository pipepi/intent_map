import { graphNodes } from "../../pip/pip-model.ts";
/** Commits validated patches, publishes immutable workspace snapshots, and maintains undo/redo. */
import { applyPipTx, type JsonValue, type Pip, type PipTx } from "../../pip/index.ts";
import type { PipWorkspace } from "../packages/node-map-package.ts";
import type { ExactPackageRef, PipCreationResult, PipValidator, WorkspacePoint, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type { SystemPluginWindow } from "../contracts/system-plugin.ts";
import {
  assertWorkspaceFrame,
  normalizeFreeLayout,
  normalizeProjectionNavigation,
  withSystemWindows,
} from "./view-state.ts";

export type CapabilityDiagnostic = {
  dependencyKind: "element" | "node-type";
  dependency: ExactPackageRef;
  stage: "resolve" | "activate";
  message: string;
};

export type WorkspaceSession = PipWorkspace & {
  undo: WorkspaceHistoryEntry[];
  redo: WorkspaceHistoryEntry[];
  capabilityDiagnostics: CapabilityDiagnostic[];
  savedGraphFingerprint: string;
};
export type WorkspaceHistoryEntry = { patch: PipTx; rootNodeIds?: string[]; projectionFrames?: Record<string, WorkspaceWindowFrame> };

export type WorkspaceHistoryDirection = "undo" | "redo";

const graph_safe_views = (value: JsonValue, root_node_ids: string[], graph: Pip): JsonValue => {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.kind !== "free-layout") return value;
  const views = normalizeFreeLayout(value, root_node_ids);
  for (const frame of Object.values(views.projections)) {
    if (!frame.navigation) continue;
    const navigation = normalizeProjectionNavigation(frame.navigation);
    const missing_index = navigation.entries.findIndex((entry) => !graphNodes(graph)[entry.projectionNodeId]);
    if (missing_index < 0) continue;
    const entries = navigation.entries.slice(0, missing_index);
    if (!entries.length) delete frame.navigation;
    else frame.navigation = { entries, index: Math.min(navigation.index, entries.length - 1), semanticScale: 1 };
  }
  return views;
};
const graph_safe_selections = (values: string[], graph: Pip) => values.filter((id) => Boolean(graphNodes(graph)[id]));

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
    const normalized = structuredClone(frame);
    if (normalized.navigation) normalized.navigation = normalizeProjectionNavigation(normalized.navigation);
    if (views.projections[windowId]) views.projections[windowId] = normalized;
    else if (views.systemWindows[windowId]) {
      views.systemWindows[windowId].frame = normalized;
      if ((workspace.views as { kind?: unknown })?.kind !== "free-layout") return void this.updateViews(workspaceId, withSystemWindows(workspace.views, views.systemWindows, views.activeWindowId, views.frontWindowId));
    }
    else throw new Error(`Unknown workspace window ${windowId}`);
    this.updateViews(workspaceId, views);
  }
    activateWindow(workspaceId: string, windowId: string) {
    const workspace = this.#workspace(workspaceId), views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    if (!views.projections[windowId] && !views.systemWindows[windowId]) throw new Error(`Unknown workspace window ${windowId}`);
    if (views.activeWindowId === windowId && views.frontWindowId === windowId) return;
    views.activeWindowId = windowId; views.frontWindowId = windowId;
    this.updateViews(workspaceId, (workspace.views as { kind?: unknown })?.kind === "free-layout"
      ? views : withSystemWindows(workspace.views, views.systemWindows, windowId, windowId));
  }
    openSystemPluginWindow(
    workspaceId: string,
    input: Omit<SystemPluginWindow, "id" | "frame"> & {
      windowId: string;
      point: WorkspacePoint;
      defaultFrame: Pick<
        WorkspaceWindowFrame,
        "width" | "height" | "resizeMode"
      >;
    },
  ) {
    const workspace = this.#workspace(workspaceId);
    const views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    const existing = views.systemWindows[input.windowId];
    const base = existing?.frame ?? input.defaultFrame;
    const x = Math.max(
      0,
      Math.min(views.world.width - base.width, input.point.x - base.width / 2),
    );
    const y = Math.max(
      0,
      Math.min(views.world.height - base.height, input.point.y - base.height / 2),
    );
    views.systemWindows[input.windowId] = {
      id: input.windowId,
      pluginId: input.pluginId,
      instanceId: input.instanceId,
      frame: {
        ...base,
        x,
        y,
      },
    };
    views.activeWindowId = input.windowId;
    views.frontWindowId = input.windowId;
    this.updateViews(
      workspaceId,
      (workspace.views as { kind?: unknown })?.kind === "free-layout"
        ? views
        : withSystemWindows(
          workspace.views,
          views.systemWindows,
          views.activeWindowId,
          views.frontWindowId,
        ),
    );
  }
    closeSystemWindow(workspaceId: string, windowId: string) {
    const workspace = this.#workspace(workspaceId), views = normalizeFreeLayout(workspace.views, workspace.rootNodeIds);
    delete views.systemWindows[windowId];
    if (views.activeWindowId === windowId) views.activeWindowId = undefined;
    if (views.frontWindowId === windowId) views.frontWindowId = undefined;
    this.updateViews(workspaceId, (workspace.views as { kind?: unknown })?.kind === "free-layout" ? views : withSystemWindows(workspace.views, views.systemWindows, views.activeWindowId, views.frontWindowId));
  }
    closeProjectionRoot(workspaceId: string, nodeId: string) {
    const workspace = this.#workspace(workspaceId);
    if (!workspace.rootNodeIds.includes(nodeId)) throw new Error(`Unknown workspace root ${nodeId}`);
    const rootNodeIds = workspace.rootNodeIds.filter((id) => id !== nodeId);
    const views = normalizeFreeLayout(workspace.views, rootNodeIds);
    if (views.activeWindowId === nodeId) views.activeWindowId = undefined;
    if (views.frontWindowId === nodeId) views.frontWindowId = undefined;
    this.#replace(this.#value.map((item) => item.id === workspaceId ? { ...workspace, rootNodeIds, views } : item));
  }
    setDiagnostics(workspaceId: string, diagnostics: CapabilityDiagnostic[]) {
    this.#replace(this.#value.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, capabilityDiagnostics: [...diagnostics] }
      : workspace));
  }
    select(workspaceId: string, nodeIds: unknown, scopeId?: string) {
        const workspace = this.#value.find((item) => item.id === workspaceId);
        if (!workspace)
            throw new Error(`Unknown workspace ${workspaceId}`);
        if (!Array.isArray(nodeIds) || nodeIds.some((id) => typeof id !== "string" || !graphNodes(workspace.graph)[id])) {
            throw new Error("Selection contains an unknown Pip");
        }
        const selection = [...new Set(nodeIds as string[])];
        if (scopeId && !workspace.rootNodeIds.includes(scopeId))
            throw new Error("Selection scope is not a workspace root");
        this.#replace(this.#value.map((item) => item.id === workspaceId
      ? scopeId
        ? { ...item, scopedSelections: { ...item.scopedSelections, [scopeId]: selection } }
        : { ...item, selection }
      : item));
    }
    commitPatch(workspaceId: string, patch: PipTx, validators: PipValidator[], recordHistory = true) {
    const workspace = this.#workspace(workspaceId);
    const applied = applyPipTx(workspace.graph, patch);
    validators.forEach((validate) => validate(applied.pip));
    const next = {
      ...workspace,
      graph: applied.pip,
      views: graph_safe_views(workspace.views, workspace.rootNodeIds, applied.pip),
      selection: graph_safe_selections(workspace.selection, applied.pip),
      scopedSelections: Object.fromEntries(Object.entries(workspace.scopedSelections ?? {}).map(([id, values]) => [id, graph_safe_selections(values, applied.pip)])),
      undo: recordHistory ? [...workspace.undo, { patch: applied.inverse }] : workspace.undo,
      redo: recordHistory ? [] : workspace.redo,
    };
    this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
  }
    commitCreation(workspaceId: string, result: PipCreationResult, point: WorkspacePoint, validators: PipValidator[]) {
        const workspace = this.#workspace(workspaceId), applied = result.patch ? applyPipTx(workspace.graph, result.patch) : undefined;
        const graph = applied?.pip ?? workspace.graph;
        validators.forEach((validate) => validate(graph));
        const roots = [...new Set([...workspace.rootNodeIds, ...(result.addRootNodeIds ?? [])])];
        roots.forEach((id) => {
            if (!graphNodes(graph)[id])
                throw new Error(`Creator returned unknown root ${id}`);
        });
        const views = normalizeFreeLayout(workspace.views, roots);
        if (result.preferredProjection) {
            const id = result.preferredProjection.projectionId;
            if (!roots.includes(id))
                throw new Error(`Creator projection ${id} is not a root`);
            const width = result.preferredProjection.width, height = result.preferredProjection.height;
            const frame = {
        x: Math.max(0, Math.min(views.world.width - width, point.x - width / 2)),
        y: Math.max(0, Math.min(views.world.height - height, point.y - height / 2)),
        width, height, resizeMode: "simple" as const,
      };
            assertWorkspaceFrame(frame, views.world);
            views.projections[id] = frame;
            views.activeWindowId = id;
            views.frontWindowId = id;
        }
        const undo = applied ? { patch: applied.inverse, rootNodeIds: [...workspace.rootNodeIds] } : undefined;
        const next = { ...workspace, graph, rootNodeIds: roots, views, undo: undo ? [...workspace.undo, undo] : workspace.undo, redo: applied ? [] : workspace.redo };
        this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
    }
    history(workspaceId: string, direction: WorkspaceHistoryDirection, validators: PipValidator[]) {
    const workspace = this.#workspace(workspaceId);
    const stack = direction === "undo" ? workspace.undo : workspace.redo;
    const patch = stack.at(-1);
    if (!patch) return;
    const applied = applyPipTx(workspace.graph, patch.patch);
    validators.forEach((validate) => validate(applied.pip));
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
    const restored = { graph: applied.pip, rootNodeIds, views: graph_safe_views(views, rootNodeIds, applied.pip),
      selection: graph_safe_selections(workspace.selection, applied.pip),
      scopedSelections: Object.fromEntries(Object.entries(workspace.scopedSelections ?? {}).map(([id, values]) => [id, graph_safe_selections(values, applied.pip)])) };
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
export const graphFingerprint = (graph: WorkspaceSession["graph"]) => JSON.stringify(canonical(graphNodes(graph)));
