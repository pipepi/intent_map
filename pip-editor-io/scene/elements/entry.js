import { SceneViewElement } from "./view-element.js";

class SceneQuadrantView extends SceneViewElement { constructor() { super("quadrant"); } }
class SceneTubeView extends SceneViewElement { constructor() { super("tube"); } }

customElements.define("scene-quadrant-view", SceneQuadrantView);
customElements.define("scene-tube-view", SceneTubeView);
