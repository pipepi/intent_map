import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import styles from "./relation-host.module.css";

export function WorkspaceTabs({ workspaces, activeWorkspaceId, nameFor, onActivate }: {
  workspaces: WorkspaceSession[];
  activeWorkspaceId?: string;
  nameFor: (workspace: WorkspaceSession) => string;
  onActivate: (workspaceId: string) => void;
}) {
  return <nav className={styles.workspaceTabs} role="tablist" aria-label="独立工作区">
    {workspaces.map((workspace) => {
      const active = workspace.id === activeWorkspaceId;
      return <button key={workspace.id} type="button" role="tab" aria-selected={active}
        className={`${styles.workspaceTab} ${active ? styles.workspaceTabActive : ""}`}
        title={`${nameFor(workspace)} · ${workspace.source.id}@${workspace.source.version}`}
        onClick={() => onActivate(workspace.id)}>
        <span>{nameFor(workspace)}</span><small>r{workspace.graph.revision}</small>
      </button>;
    })}
    {!workspaces.length && <span className={styles.workspaceTabsEmpty}>导入 A5 后在这里打开工作区</span>}
  </nav>;
}
