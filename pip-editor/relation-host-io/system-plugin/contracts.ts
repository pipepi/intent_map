/** 系统插件的定义、实例和 React 呈现协议。 */
import type { ComponentType } from "react";
import type {
  JsonValue,
  RelationGraph,
  RelationNode,
} from "../../relation/index.ts";
import type { WorkspaceWindowFrame } from "../../relation-host/contracts/package-types.ts";
import type { SystemPluginWorkspace } from "../../relation-host/contracts/system-plugin.ts";

export type SystemPluginScope = "workspace" | "host";
export type SystemPluginInstancePolicy = "singleton" | "multiple";

export type SystemPluginInstance = {
  id: string;
  pluginId: string;
  node: RelationNode;
  scope: SystemPluginScope;
  workspaceId?: string;
  state: JsonValue;
};

/**
 * services 只对随 A2 发布的可信系统插件开放。具体插件负责把它收窄为
 * 自己需要的宿主能力，通用 runtime 不理解这些特权对象。
 */
export type SystemPluginHostSnapshot = {
  workspace: SystemPluginWorkspace;
  services: unknown;
};

export type SystemPluginComponentProps = {
  graph: RelationGraph;
  instance: SystemPluginInstance;
  model: unknown;
  setState: (state: JsonValue) => void;
};

export type SystemPluginDefinition = {
  id: string;
  typeNode: RelationNode;
  label: string;
  description?: string;
  category: string;
  icon?: string;
  scope: SystemPluginScope;
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
  graph: RelationGraph;
  instances: SystemPluginInstance[];
};
