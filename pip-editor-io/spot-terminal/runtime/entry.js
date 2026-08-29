import { cancelOrder, draft, login, logout, selectPeriod, selectSymbol, setBotSide, setBotType, submitOrder, switchEnvironment, sync, toggleBot, toggleBotFast, toggleBotGuard } from "./commands.js";
import { configOf } from "./state.js";
import { terminalCreator } from "./creator.js";
import { clearSessions } from "./session.js";
import { scalar, target } from "./selectors.js";
import { withWindowChrome } from "./window-chrome.js";

const TYPE = "spot.terminal.type.workspace";
const DEFINITIONS = {
  workspace: "spot.terminal.projection.workspace",
  children: "spot.terminal.projection.children",
  world: "spot.terminal.projection.world-events",
  embedded: "spot.terminal.projection.embedded",
};
const element = { pluginId: "official.spot-terminal-elements", elementId: "terminal" };
const projectionLabels = {
  [DEFINITIONS.workspace]: { label: "工作空间 · 观察自身", context: "self-workspace" },
  [DEFINITIONS.children]: { label: "工作空间 · 观察子级 · 工作流模型", context: "children-workspace" },
  [DEFINITIONS.world]: { label: "工作空间 · 观察子级 · 世界事件模型", context: "children-workspace" },
  [DEFINITIONS.embedded]: { label: "父级空间 · 观察自身", context: "self-workspace" },
};

function optionsFor(graph, observedNodeId) {
  return Object.values(graph.nodes).flatMap((node) => {
    if (target(node, "relation.projection.predicate.observes")?.nodeId !== observedNodeId) return [];
    const definition = target(node, "relation.projection.predicate.uses")?.nodeId;
    const option = projectionLabels[definition];
    return option ? [{ projectionNodeId: node.id, observedNodeId, ...option }] : [];
  });
}

function projection(kind, name, contexts, icon, windowChrome = "plugin") {
  const definition = DEFINITIONS[kind];
  return {
    id: definition, name, icon, purpose: "workspace", windowChrome,
    // A3 owns a 36px plugin navigation row; A4 relays its true zoom boundary to A2.
    zoomViewport: { top: kind === "embedded" ? 0 : 36, right: 0, bottom: 0, left: 0 },
    definition: { nodeId: definition, relationId: "identity" }, contexts,
    matches(node) { return target(node, "relation.projection.predicate.uses")?.nodeId === definition; },
    project({ observedNode, projectionNode, workspaceView, graph }) {
      const { environment, label: environmentLabel, host } = configOf(observedNode);
      const state = { ...scalar(observedNode, "spot.terminal.predicate.state", { authenticated: false }), environment, environmentLabel, host, viewKind: kind };
      return kind === "embedded" ? state : withWindowChrome(state, workspaceView, projectionNode.id, name, optionsFor(graph, observedNode.id));
    },
    element,
  };
}

export default function register(host) {
  const releases = [];
  releases.push(host.registerType({
    type: { nodeId: TYPE, relationId: "identity" }, name: "Spot Terminal",
    matches(node) { return target(node, "relation.core.type")?.nodeId === TYPE; }, label: () => "AEX Spot Terminal",
    projectionDefaults: { selfEmbedded: DEFINITIONS.embedded, childrenWorkspace: DEFINITIONS.children },
  }));
  releases.push(host.registerProjection(projection("workspace", "Spot Trading Terminal", ["self-workspace"], "↗")));
  releases.push(host.registerProjection(projection("children", "Spot Children · Flow", ["children-workspace"], "⇄")));
  releases.push(host.registerProjection(projection("world", "Spot Children · World Events", ["children-workspace"], "◎")));
  // Host contract requires every embedded projection to also be independently inspectable.
  releases.push(host.registerProjection(projection("embedded", "Spot Compact Card", ["self-workspace", "self-embedded"], "▣", "host")));
  [["login", login], ["select-symbol", selectSymbol], ["select-period", selectPeriod], ["submit", submitOrder], ["cancel", cancelOrder], ["sync", sync], ["draft", draft], ["bot-toggle", toggleBot], ["bot-fast", toggleBotFast], ["bot-guard", toggleBotGuard], ["bot-side", setBotSide], ["bot-type", setBotType], ["switch-environment", switchEnvironment], ["logout", logout]]
    .forEach(([name, command]) => releases.push(host.registerCommand(`spot.terminal.${name}`, command)));
  releases.push(host.registerCreator(terminalCreator));
  return () => { clearSessions(); releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose()); };
}
