import { cancelOrder, draft, login, logout, selectPeriod, selectSymbol, setBotSide, setBotType, submitOrder, sync, toggleBot, toggleBotFast } from "./commands.js";
import { terminalCreator } from "./creator.js";
import { clearSessions } from "./session.js";
import { scalar, target } from "./selectors.js";

const TYPE = "spot.terminal.type.workspace", DEFINITION = "spot.terminal.projection.workspace";
export default function register(host) {
  const releases = [];
  releases.push(host.registerType({ type: { nodeId: TYPE, relationId: "identity" }, name: "Spot Terminal", matches(node) { return target(node, "relation.core.type")?.nodeId === TYPE; }, label: () => "AEX Spot Terminal", projectionDefaults: { selfEmbedded: DEFINITION, childrenWorkspace: DEFINITION } }));
  releases.push(host.registerProjection({ id: DEFINITION, name: "Spot Trading Terminal", purpose: "workspace", definition: { nodeId: DEFINITION, relationId: "identity" }, contexts: ["self-workspace", "self-embedded"], matches(node) { return target(node, "relation.projection.predicate.uses")?.nodeId === DEFINITION; }, project({ observedNode }) { return scalar(observedNode, "spot.terminal.predicate.state", { authenticated: false }); }, element: { pluginId: "official.spot-terminal-elements", elementId: "terminal" } }));
  [["login", login], ["select-symbol", selectSymbol], ["select-period", selectPeriod], ["submit", submitOrder], ["cancel", cancelOrder], ["sync", sync], ["draft", draft], ["bot-toggle", toggleBot], ["bot-fast", toggleBotFast], ["bot-side", setBotSide], ["bot-type", setBotType], ["logout", logout]].forEach(([name, command]) => releases.push(host.registerCommand(`spot.terminal.${name}`, command)));
  releases.push(host.registerCreator(terminalCreator));
  return () => { clearSessions(); releases.reverse().forEach((release) => typeof release === "function" ? release() : release.dispose()); };
}
