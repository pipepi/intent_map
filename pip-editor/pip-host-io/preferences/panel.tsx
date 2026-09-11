/** 编辑器宿主偏好设置面板。 */
import { useId } from "react";
import type { WorkspacePresentationMode } from "../../pip-host/workspace/host-presentation-store.ts";
import styles from "../../pip-host/view/pip-host.module.css";

export type PreferencesModel = {
  workspaceOpenMode: WorkspacePresentationMode;
  onWorkspaceOpenModeChange: (mode: WorkspacePresentationMode) => void;
};

export function PreferencesPanel({
  workspaceOpenMode,
  onWorkspaceOpenModeChange,
}: PreferencesModel) {
  // host 单例可以同时出现在多个表面，每份 DOM 必须拥有独立 radio 分组。
  const workspaceOpenModeGroup = useId();

  return <section className={styles.panel} data-testid="editor-preferences">
    <div className={styles.panelTitle} data-window-drag>
      <div className={styles.panelIdentity}>
        <span>PIP EDITOR</span>
        <h2>宿主偏好设置</h2>
      </div>
    </div>

    <fieldset className={styles.preferenceGroup}>
      <legend>新工作区默认呈现方式</legend>
      <label>
        <input
          type="radio"
          name={workspaceOpenModeGroup}
          checked={workspaceOpenMode === "tab"}
          onChange={() => onWorkspaceOpenModeChange("tab")}
        />
        固定 Tab
      </label>
      <label>
        <input
          type="radio"
          name={workspaceOpenModeGroup}
          checked={workspaceOpenMode === "window"}
          onChange={() => onWorkspaceOpenModeChange("window")}
        />
        宿主节点窗口
      </label>
    </fieldset>
  </section>;
}
