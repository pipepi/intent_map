import { attachChild, detachChild, moveChild } from "./commands.js";
import { projectChildren, projectFlowChildren, projectProperties } from "./project.js";
import { definitionId, isProjection, nameOf, observed } from "./selectors.js";
import { validateProjectionGraph } from "./validation.js";
import { flowPlanner } from "../flow/compiler.js";
import { operators, runtimes } from "../flow/runtime.js";
import { triggerProviders } from "../flow/triggers.js";
import { typeOf } from "../flow/selectors.js";
import { validateFlowGraph } from "../flow/validation.js";
import { connectFlow, disconnectFlow } from "../flow/commands.js";

const ref = (nodeId) => ({ node_id: nodeId, pip_id: "identity" });
const flowTypes = ["executable", "composite", "state", "effect"].map((name) => `pip.flow.type.${name}`);
const triggerTypes = ["manual", "hook", "schedule", "poll", "custom"].map((name) => `pip.trigger.type.${name}`);
export default function register(host) {
  const releases = [];
  releases.push(host.registerType({ type: ref("pip.projection.type.instance"), name: "projection-instance", matches: isProjection,
    label(node, graph) { const target = observed(node, graph); return `${target ? nameOf(target) : node.id} · ${definitionId(node)?.split(".").at(-1) ?? "projection"}`; },
  }));
  releases.push(host.registerProjection({
    id: "pip.properties", name: "属性", icon: "▤", definition: ref("pip.projection.definition.properties"), scope: "self", surfaces: ["workspace", "embedded"],
    matches(node) { return definitionId(node) === "pip.projection.definition.properties"; }, project: projectProperties,
    element: { pluginId: "official.pip-projection-elements", elementId: "properties" },
  }));
  releases.push(host.registerProjection({
    id: "pip.contains", name: "直接子级", icon: "⌘", definition: ref("pip.projection.definition.contains"), scope: "children", surfaces: ["workspace"],
    matches(node) { return definitionId(node) === "pip.projection.definition.contains"; }, project: projectChildren,
    element: { pluginId: "official.pip-projection-elements", elementId: "contains" },
  }));
  releases.push(host.registerProjection({
    id: "pip.flow", name: "执行流", icon: "⇄", definition: ref("pip.projection.definition.flow"), scope: "children", surfaces: ["workspace"],
    matches(node) { return definitionId(node) === "pip.projection.definition.flow"; }, project: projectFlowChildren,
    element: { pluginId: "official.pip-projection-elements", elementId: "contains" },
  }));
  for (const nodeId of [...flowTypes, ...triggerTypes, "pip.execution.type.run"]) releases.push(host.registerType({
    type: ref(nodeId), name: nodeId.split(".").at(-1), matches(node) { return typeOf(node) === nodeId; },
  }));
  releases.push(host.registerValidator(validateProjectionGraph));
  releases.push(host.registerValidator(validateFlowGraph));
  releases.push(host.registerCommand("pip.attach-child-projection", attachChild));
  releases.push(host.registerCommand("pip.detach-child-projection", detachChild));
  releases.push(host.registerCommand("pip.move-child-projection", moveChild));
  releases.push(host.registerCommand("pip.flow.connect", connectFlow));
  releases.push(host.registerCommand("pip.flow.disconnect", disconnectFlow));
  releases.push(host.registerExecutionPlanner(flowPlanner));
  for (const runtime of runtimes) releases.push(host.registerNodeRuntime(runtime));
  for (const operator of operators) releases.push(host.registerPipOperator(operator));
  for (const provider of triggerProviders) releases.push(host.registerTriggerProvider(provider));
  releases.push(host.registerEffectHandler({ type: "pip.flow.effect", async execute(effect) { return { accepted: true, input: effect.input }; } }));
  return () => releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose());
}
