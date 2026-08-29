import { SpotTerminalElement } from "./terminal-element.js";
import { SpotCompositionElement } from "./composition-element.js";
import { SpotFactElement } from "./fact-element.js";
import { SpotTerminalSimpleElement } from "./simple-element.js";

if (!customElements.get("spot-terminal-view")) customElements.define("spot-terminal-view", SpotTerminalElement);
if (!customElements.get("spot-terminal-simple")) customElements.define("spot-terminal-simple", SpotTerminalSimpleElement);
if (!customElements.get("spot-composition-view")) customElements.define("spot-composition-view", SpotCompositionElement);
if (!customElements.get("spot-fact-view")) customElements.define("spot-fact-view", SpotFactElement);
