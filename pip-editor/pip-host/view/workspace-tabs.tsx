import { graphRevision } from "../../pip/pip-model.ts";
import { useState } from "react";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import styles from "./workspace-tabs.module.css";

export const WORKSPACE_DRAG_MIME = "application/x-intent-map-workspace";

type WorkspaceTabsProps = {
  activeWorkspaceId?: string;
  workspaces: WorkspaceSession[];
  nameFor: (workspace: WorkspaceSession) => string;
  onActivate: (workspaceId: string) => void;
  onClose: (workspaceId: string) => void;
  onNew: () => void;
  onReorder: (workspaceId: string, beforeId?: string) => void;
};

export function WorkspaceTabs({
  activeWorkspaceId,
  workspaces,
  nameFor,
  onActivate,
  onClose,
  onNew,
  onReorder,
}: WorkspaceTabsProps) {
  const [dragging, setDragging] = useState<string>();

  return <nav
    className={styles.workspaceTabs}
    role="tablist"
    aria-label="独立工作区"
  >
    {workspaces.map((workspace) => {
      const active = workspace.id === activeWorkspaceId;
      const name = nameFor(workspace);
      return <div
        key={workspace.id}
        role="presentation"
        draggable
        onDragStart={(event) => {
          setDragging(workspace.id);
          event.dataTransfer.setData(WORKSPACE_DRAG_MIME, workspace.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragging(undefined)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (dragging && dragging !== workspace.id) {
            onReorder(dragging, workspace.id);
          }
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className={`${styles.workspaceTab} ${
            active ? styles.workspaceTabActive : ""
          }`} title={`${name} · ${workspace.source.id}@${workspace.source.version}`} onClick={(event) => {
                    event.currentTarget.blur();
                    onActivate(workspace.id);
                }} onAuxClick={(event) => {
                    if (event.button === 1)
                        onClose(workspace.id);
                }}>
          <span>{name}</span>
          <small>{workspace.source.id === "host.new-tab"
                    ? ""
                    : `r${graphRevision(workspace.graph)}`}</small>
          <i role="button" aria-label={`关闭 ${name}`} className={styles.workspaceTabClose} onClick={(event) => {
                    event.stopPropagation();
                    onClose(workspace.id);
                }}>×</i>
        </button>
      </div>;
        })}
    <button type="button" className={styles.workspaceTabAdd} onClick={(event) => {
            event.currentTarget.blur();
            onNew();
        }} title="打开创建器" aria-label="打开创建器">+</button>
  </nav>;
}
