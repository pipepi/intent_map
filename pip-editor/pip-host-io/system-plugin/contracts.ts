/** 系统插件的定义、实例和 React 呈现协议。 */
import type { ComponentType } from "react";
import type {
  JsonValue,
  Pip} from "../../pip/index.ts";
import type { WorkspaceWindowFrame } from "../../pip-host/contracts/package-types.ts";
import type { SystemPluginWorkspace } from "../../pip-host/contracts/system-plugin.ts";

export type SystemPluginScope = "workspace" | "host";
export type SystemPluginSurface = "host" | "workspace";
export type SystemPluginInstancePolicy = "singleton" | "multiple";

export type SystemPluginInstance = {
  id: string;
  pluginId: string;
  node: Pip;
  scope: SystemPluginScope;
  workspaceId?: string;
  state: JsonValue;
};

/**
 * services 只对随 A2 发布的可信系统插件开放。具体插件负责把它收窄为
 * 自己需要的宿主能力，通用 runtime 不理解这些特权对象。
 */
export type SystemPluginHostSnapshot = {
  surface: SystemPluginSurface;
  workspace?: SystemPluginWorkspace;
  services: unknown;
};

export type SystemPluginComponentProps = {
  graph: Pip;
  instance: SystemPluginInstance;
  model: unknown;
  setState: (state: JsonValue) => void;
};

export type SystemPluginDefinition = {
  id: string;
  typeNode: Pip;
  label: string;
  description?: string;
  category: string;
  icon?: string;
  scope: SystemPluginScope;
  /** scope 决定生命周期，surfaces 只声明允许呈现的位置。 */
  surfaces: SystemPluginSurface[];
  instancePolicy: SystemPluginInstancePolicy;
  defaultWindow: Pick<
    WorkspaceWindowFrame,
    "width" | "height" | "resizeMode"
  >;
  accepts?: (workspace: SystemPluginWorkspace) => boolean;
  createState?: () => JsonValue;
  dispose?: (instance: SystemPluginInstance) => void;
  buildModel: (
    snapshot: SystemPluginHostSnapshot,
    instance: SystemPluginInstance,
  ) => unknown;
  Component: ComponentType<SystemPluginComponentProps>;
};

export type SystemPluginRuntimeSnapshot = {
  graph: Pip;
  instances: SystemPluginInstance[];
};
