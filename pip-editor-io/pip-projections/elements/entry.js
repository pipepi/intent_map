import { PipContainsElement } from "./contains-element.js";
import { PipPropertiesElement } from "./properties-element.js";

if (!customElements.get("pip-properties-view")) customElements.define("pip-properties-view", PipPropertiesElement);
if (!customElements.get("pip-contains-view")) customElements.define("pip-contains-view", PipContainsElement);
