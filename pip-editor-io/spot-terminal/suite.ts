import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/relation-host/packages/element-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/relation-host/packages/node-type-package.ts";
import { exactPackageRef } from "../../pip-editor/relation-host/packages/pip-package.ts";
import { baseElementManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { SPOT_ELEMENT_PLUGIN_ID, SPOT_NODE_PLUGIN_ID, SPOT_TERMINAL_TYPE, spotTerminalOntology } from "./domain.ts";

const elementFiles = ["elements/format.js", "elements/styles.js", "elements/environment-toggle.js", "elements/chart.js", "elements/book-scroll.js", "elements/bot-controls.js", "elements/window-navigation.js", "elements/projection-views.js", "elements/render.js", "elements/terminal-element.js", "elements/entry.js"];
const runtimeFiles = ["runtime/selectors.js", "runtime/environment.js", "runtime/state.js", "runtime/session.js", "runtime/http.js", "runtime/periods.js", "runtime/normalize.js", "runtime/validation.js", "runtime/bot.js", "runtime/stomp.js", "runtime/fusion.js", "runtime/load.js", "runtime/commands.js", "runtime/window-chrome.js", "runtime/creator.js", "runtime/entry.js"];
async function sources(paths: string[]) { return Object.fromEntries(await Promise.all(paths.map(async (path) => [`source/${path}`, await readFile(new URL(path, import.meta.url), "utf8")]))); }
async function bundle(entry: string) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", minify: true });
  const output = result.outputFiles[0]; if (!output) throw new Error(`Spot terminal bundle ${entry} produced no output`); return output.text;
}
export async function buildSpotTerminalPluginSuite() {
  const [elementSources, runtimeSources, elementSource, runtimeSource] = await Promise.all([sources(elementFiles), sources(runtimeFiles), bundle("elements/entry.js"), bundle("runtime/entry.js")]);
  const elementManifest = { ...baseElementManifest(SPOT_ELEMENT_PLUGIN_ID, "AEX Spot Terminal Elements", Object.keys(elementSources)), packageVersion: "1.9.1", elements: [{ id: "terminal", tag: "spot-terminal-view", purpose: "projection" as const }] };
  const elementPip = await encodeElementPackage(elementManifest, elementSource, elementSources), element = await decodeElementPackage(elementPip);
  const nodeManifest = { ...baseNodeTypeManifest(SPOT_NODE_PLUGIN_ID, "AEX Spot Terminal Types", [SPOT_TERMINAL_TYPE], [await exactPackageRef(elementPip, element.manifest)], Object.keys(runtimeSources)), packageVersion: "1.13.2" };
  const nodeTypePip = await encodeNodeTypePackage(nodeManifest, spotTerminalOntology, runtimeSource, runtimeSources, [element]), nodeType = await decodeNodeTypePackage(nodeTypePip);
  return { elementPip, nodeTypePip, element, nodeType };
}
