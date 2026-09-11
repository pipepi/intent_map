/** 校验并持久化只属于当前编辑器宿主的偏好。 */
import type { WorkspacePresentationMode } from "../../pip-host/workspace/host-presentation-store.ts";

export type EditorPreferences = {
  schemaVersion: 1;
  workspaceOpenMode: WorkspacePresentationMode;
};

const STORAGE_KEY = "intent-map.editor-preferences.v1";

export const defaultEditorPreferences = (): EditorPreferences => ({
  schemaVersion: 1,
  workspaceOpenMode: "tab",
});

const valid = (value: unknown): value is EditorPreferences => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 1 &&
    (item.workspaceOpenMode === "tab" || item.workspaceOpenMode === "window");
};

export class EditorPreferenceStore {
  #value: EditorPreferences;
  readonly #publish: (value: EditorPreferences) => void;

  constructor(publish: (value: EditorPreferences) => void) {
    this.#publish = publish;
    this.#value = defaultEditorPreferences();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : undefined;
      if (valid(parsed)) this.#value = parsed;
    } catch {
      // 浏览器禁用存储或旧数据损坏时，默认值仍保证编辑器可启动。
    }
  }

  snapshot() {
    return this.#value;
  }

  setWorkspaceOpenMode(workspaceOpenMode: WorkspacePresentationMode) {
    const next: EditorPreferences = {
      schemaVersion: 1,
      workspaceOpenMode,
    };
    this.#value = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 偏好持久化失败不应阻断当前会话内的设置。
    }
    this.#publish(next);
  }
}
