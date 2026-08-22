import { RelationContainsElement } from "./contains-element.js";
import { RelationPropertiesElement } from "./properties-element.js";

if (!customElements.get("relation-properties-view")) customElements.define("relation-properties-view", RelationPropertiesElement);
if (!customElements.get("relation-contains-view")) customElements.define("relation-contains-view", RelationContainsElement);
