/** 把宿主偏好设置注册成可横向扩展的系统节点插件。 */
import type {
  SystemPluginComponentProps,
  SystemPluginDefinition,
  SystemPluginHostSnapshot,
} from "../system-plugin/contracts.ts";
import { createSystemPluginTypeNode } from "../system-plugin/runtime.ts";
import {
  PreferencesPanel,
  type PreferencesModel,
} from "./panel.tsx";
import type { EditorPreferenceStore } from "./store.ts";

export type PreferencesHostServices = {
  preferences: EditorPreferenceStore;
};

const buildModel = (
  snapshot: SystemPluginHostSnapshot,
): PreferencesModel => {
  const services = snapshot.services as PreferencesHostServices;
  return {
    workspaceOpenMode: services.preferences.snapshot().workspaceOpenMode,
    onWorkspaceOpenModeChange: (mode) => {
      services.preferences.setWorkspaceOpenMode(mode);
    },
  };
};

function PreferencesSystemNode({ model }: SystemPluginComponentProps) {
  return <PreferencesPanel {...model as PreferencesModel} />;
}

export const preferencesSystemPlugin: SystemPluginDefinition = {
  id: "host.preferences",
  typeNode: createSystemPluginTypeNode("relation.host.type.preferences"),
  label: "偏好设置",
  description: "调整编辑器宿主的默认行为",
  category: "系统",
  icon: "◈",
  scope: "host",
  surfaces: ["host", "workspace"],
  instancePolicy: "singleton",
  defaultWindow: {
    width: 520,
    height: 520,
    resizeMode: "simple",
  },
  buildModel,
  Component: PreferencesSystemNode,
};
