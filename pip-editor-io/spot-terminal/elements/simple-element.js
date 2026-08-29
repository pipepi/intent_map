import { embeddedTerminal } from "./projection-views.js";
import { styles } from "./styles.js";

export class SpotTerminalSimpleElement extends HTMLElement {
  set context(value) { this._context = value; this.render(); }
  connectedCallback() { this.render(); }
  render() {
    const state = this._context?.projection?.data ?? {};
    this.innerHTML = `<style>${styles}</style>${embeddedTerminal(state)}`;
  }
}

