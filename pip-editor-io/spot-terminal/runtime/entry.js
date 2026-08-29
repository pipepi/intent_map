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
  [DEFINITIONS.workspace]: { label: "Detail · 观察自身", scope: "self" },
  [DEFINITIONS.children]: { label: "Flow · 观察子级", scope: "children" },
  [DEFINITIONS.world]: { label: "World Events · 观察子级", scope: "children" },
  [DEFINITIONS.embedded]: { label: "Overview · 观察自身", scope: "self" },
};

function optionsFor(graph, observedNodeId, currentProjectionNode) {
  const diveTarget = target(currentProjectionNode, "relation.projection.predicate.dives-into")?.nodeId;
  return Object.values(graph.nodes).flatMap((node) => {
    if (target(node, "relation.projection.predicate.observes")?.nodeId !== observedNodeId) return [];
    const definition = target(node, "relation.projection.predicate.uses")?.nodeId;
    const option = projectionLabels[definition];
    return option ? [{ projectionNodeId: node.id, observedNodeId, semanticTarget: diveTarget === node.id, ...option }] : [];
  });
}

function projection(kind, name, scope, surfaces, icon, windowChrome = "plugin") {
  const definition = DEFINITIONS[kind];
  return {
    id: definition, name, icon, purpose: "workspace", windowChrome,
    // A3 owns a 36px plugin navigation row; A4 relays its true zoom boundary to A2.
    zoomViewport: { top: kind === "embedded" ? 0 : 36, right: 0, bottom: 0, left: 0 },
    definition: { nodeId: definition, relationId: "identity" }, scope, surfaces,
    matches(node) { return target(node, "relation.projection.predicate.uses")?.nodeId === definition; },
    project({ observedNode, projectionNode, workspaceView, graph, context }) {
      const { environment, label: environmentLabel, host } = configOf(observedNode);
      const state = { ...scalar(observedNode, "spot.terminal.predicate.state", { authenticated: false }), environment, environmentLabel, host, viewKind: kind };
      return kind === "embedded" || context.surface === "embedded" ? state : withWindowChrome(state, workspaceView, projectionNode.id, name, optionsFor(graph, observedNode.id, projectionNode));
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
  releases.push(host.registerProjection(projection("workspace", "Spot Detail", "self", ["workspace", "embedded"], "↗")));
  releases.push(host.registerProjection(projection("children", "Spot Flow", "children", ["workspace"], "⇄")));
  releases.push(host.registerProjection(projection("world", "Spot World Events", "children", ["workspace"], "◎")));
  releases.push(host.registerProjection(projection("embedded", "Spot Overview", "self", ["workspace", "embedded"], "▣", "host")));
  [["login", login], ["select-symbol", selectSymbol], ["select-period", selectPeriod], ["submit", submitOrder], ["cancel", cancelOrder], ["sync", sync], ["draft", draft], ["bot-toggle", toggleBot], ["bot-fast", toggleBotFast], ["bot-guard", toggleBotGuard], ["bot-side", setBotSide], ["bot-type", setBotType], ["switch-environment", switchEnvironment], ["logout", logout]]
    .forEach(([name, command]) => releases.push(host.registerCommand(`spot.terminal.${name}`, command)));
  releases.push(host.registerCreator(terminalCreator));
  return () => { clearSessions(); releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose()); };
}
