/** 把系统 overlay 中的虚拟 PipNode 呈现为可信 React 系统插件。 */
import type { SystemPluginHostSnapshot } from "./contracts.ts";
import type { SystemPluginRegistry } from "./registry.ts";
import type { SystemPluginRuntime } from "./runtime.ts";
import styles from "../../pip-host/view/pip-host.module.css";

type SystemPluginRendererProps = {
  instanceId: string;
  registry: SystemPluginRegistry;
  runtime: SystemPluginRuntime;
  snapshot: SystemPluginHostSnapshot;
};

export function SystemPluginRenderer({
  instanceId,
  registry,
  runtime,
  snapshot,
}: SystemPluginRendererProps) {
  const instance = runtime.get(instanceId);
  if (!instance) {
    return <div className={styles.orphan}>
      未找到系统插件实例：{instanceId}
    </div>;
  }

  const definition = registry.get(instance.pluginId);
  if (!definition) {
    return <div className={styles.orphan}>
      未注册系统插件：{instance.pluginId}
    </div>;
  }

  const Component = definition.Component;
  return <Component
    graph={runtime.snapshot().graph}
    instance={instance}
    model={definition.buildModel(snapshot, instance)}
    setState={(state) => runtime.setState(instance.id, state)}
  />;
}
