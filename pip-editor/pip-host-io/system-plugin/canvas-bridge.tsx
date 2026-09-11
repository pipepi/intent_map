/** 将系统插件内部 registry/runtime 收窄成 Canvas 可消费的宿主协议。 */
import type {
  SystemPluginCanvasBridge,
  SystemPluginCanvasRendererProps,
} from "../../pip-host/contracts/system-plugin.ts";
import { SystemPluginRenderer } from "./renderer.tsx";
import type { SystemPluginRegistry } from "./registry.ts";
import type { SystemPluginRuntime } from "./runtime.ts";

export function createSystemPluginCanvasBridge(
  registry: SystemPluginRegistry,
  runtime: SystemPluginRuntime,
): SystemPluginCanvasBridge {
  function Renderer({
    services,
    surface,
    window,
    workspace,
  }: SystemPluginCanvasRendererProps) {
    return <SystemPluginRenderer
      instanceId={window.instanceId}
      registry={registry}
      runtime={runtime}
      snapshot={{
        surface,
        workspace,
        services,
      }}
    />;
  }

  return {
    creatorChoices: (surface, workspace) => registry
      .list()
      .filter((definition) => definition.surfaces.includes(surface))
      .filter((definition) => {
        if (!workspace) return definition.scope === "host";
        return definition.accepts?.(workspace) !== false;
      })
      .map((definition) => ({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        category: definition.category,
        icon: definition.icon,
        provider: "system",
      })),
    Renderer,
  };
}
