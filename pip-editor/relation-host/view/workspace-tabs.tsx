import { useState } from "react";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import styles from "./relation-host.module.css";

export function WorkspaceTabs({ workspaces, activeWorkspaceId, nameFor, onActivate, onClose, onNew, onReorder }: {
  workspaces: WorkspaceSession[]; activeWorkspaceId?: string; nameFor: (workspace: WorkspaceSession) => string;
  onActivate: (workspaceId: string) => void; onClose: (workspaceId: string) => void; onNew: () => void;
  onReorder: (workspaceId: string, beforeId?: string) => void;
}) {
  const [dragging, setDragging] = useState<string>();
  return <nav className={styles.workspaceTabs} role="tablist" aria-label="独立工作区">
    {workspaces.map((workspace) => {
      const active = workspace.id === activeWorkspaceId;
      return <div key={workspace.id} role="presentation" draggable onDragStart={() => setDragging(workspace.id)} onDragEnd={() => setDragging(undefined)}
        onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging && dragging !== workspace.id) onReorder(dragging, workspace.id); }}>
        <button type="button" role="tab" aria-selected={active} className={`${styles.workspaceTab} ${active ? styles.workspaceTabActive : ""}`}
          title={`${nameFor(workspace)} · ${workspace.source.id}@${workspace.source.version}`} onClick={(event) => { event.currentTarget.blur(); onActivate(workspace.id); }}
          onAuxClick={(event) => { if (event.button === 1) onClose(workspace.id); }}>
          <span>{nameFor(workspace)}</span><small>{workspace.source.id === "host.new-tab" ? "" : `r${workspace.graph.revision}`}</small>
          <i role="button" aria-label={`关闭 ${nameFor(workspace)}`} className={styles.workspaceTabClose} onClick={(event) => { event.stopPropagation(); onClose(workspace.id); }}>×</i>
        </button>
      </div>;
    })}
    <button type="button" className={styles.workspaceTabAdd} onClick={(event) => { event.currentTarget.blur(); onNew(); }} title="新建标签" aria-label="新建标签">+</button>
  </nav>;
}
