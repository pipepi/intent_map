/** Commits validated patches, publishes immutable workspace snapshots, and maintains undo/redo. */
import { applyRelationPatch, type RelationPatch } from "../../relation/index.ts";
import type { RelationWorkspace } from "../packages/collection-package.ts";
import type { ExactPackageRef, RelationValidator } from "../contracts/package-types.ts";

export type CapabilityDiagnostic = {
  dependencyKind: "element" | "node-type";
  dependency: ExactPackageRef;
  stage: "resolve" | "activate";
  message: string;
};

export type WorkspaceSession = RelationWorkspace & {
  undo: RelationPatch[];
  redo: RelationPatch[];
  capabilityDiagnostics: CapabilityDiagnostic[];
};

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

  setDiagnostics(workspaceId: string, diagnostics: CapabilityDiagnostic[]) {
    this.#replace(this.#value.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, capabilityDiagnostics: [...diagnostics] }
      : workspace));
  }

  select(workspaceId: string, nodeIds: unknown) {
    const workspace = this.#value.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);
    if (!Array.isArray(nodeIds) || nodeIds.some((id) => typeof id !== "string" || !workspace.graph.nodes[id])) {
      throw new Error("Selection contains an unknown RelationNode");
    }
    const selection = [...new Set(nodeIds as string[])];
    this.#replace(this.#value.map((item) => item.id === workspaceId ? { ...item, selection } : item));
  }

  commitPatch(workspaceId: string, patch: RelationPatch, validators: RelationValidator[], recordHistory = true) {
    const workspace = this.#value.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);
    const applied = applyRelationPatch(workspace.graph, patch);
    validators.forEach((validate) => validate(applied.graph));
    const next = {
      ...workspace,
      graph: applied.graph,
      undo: recordHistory ? [...workspace.undo, applied.inverse] : workspace.undo,
      redo: recordHistory ? [] : workspace.redo,
    };
    this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
  }

  history(workspaceId: string, direction: WorkspaceHistoryDirection, validators: RelationValidator[]) {
    const workspace = this.#value.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);
    const stack = direction === "undo" ? workspace.undo : workspace.redo;
    const patch = stack.at(-1);
    if (!patch) return;
    const applied = applyRelationPatch(workspace.graph, patch);
    validators.forEach((validate) => validate(applied.graph));
    const next = direction === "undo"
      ? { ...workspace, graph: applied.graph, undo: stack.slice(0, -1), redo: [...workspace.redo, applied.inverse] }
      : { ...workspace, graph: applied.graph, redo: stack.slice(0, -1), undo: [...workspace.undo, applied.inverse] };
    this.#replace(this.#value.map((item) => item.id === workspaceId ? next : item));
  }
}
