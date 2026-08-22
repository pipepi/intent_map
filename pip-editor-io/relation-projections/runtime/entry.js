import { attachChild, detachChild } from "./commands.js";
import { projectChildren, projectProperties } from "./project.js";
import { definitionId, isProjection, nameOf, observed } from "./selectors.js";
import { validateProjectionGraph } from "./validation.js";

const ref = (nodeId) => ({ nodeId, relationId: "identity" });
export default function register(host) {
  const releases = [];
  releases.push(host.registerType({ type: ref("relation.projection.type.instance"), name: "projection-instance", matches: isProjection,
    label(node, graph) { const target = observed(node, graph); return `${target ? nameOf(target) : node.id} · ${definitionId(node)?.split(".").at(-1) ?? "projection"}`; },
  }));
  releases.push(host.registerProjection({
    id: "relation.properties", name: "属性", icon: "▤", definition: ref("relation.projection.definition.properties"), contexts: ["self-workspace", "self-embedded"],
    matches(node) { return definitionId(node) === "relation.projection.definition.properties"; }, project: projectProperties,
    element: { pluginId: "official.relation-projection-elements", elementId: "properties" },
  }));
  releases.push(host.registerProjection({
    id: "relation.contains", name: "直接子级", icon: "⌘", definition: ref("relation.projection.definition.contains"), contexts: ["children-workspace"],
    matches(node) { return definitionId(node) === "relation.projection.definition.contains"; }, project: projectChildren,
    element: { pluginId: "official.relation-projection-elements", elementId: "contains" },
  }));
  releases.push(host.registerValidator(validateProjectionGraph));
  releases.push(host.registerCommand("relation.attach-child-projection", attachChild));
  releases.push(host.registerCommand("relation.detach-child-projection", detachChild));
  return () => releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose());
}
