import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/pip-host/packages/element-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/pip-host/packages/node-type-package.ts";
import { exactPackageRef } from "../../pip-editor/pip-host/packages/pip-package.ts";
import { baseElementManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { EXECUTION_TYPES, FLOW_TYPES, PROJECTION_INSTANCE_TYPE, PIP_ELEMENT_PLUGIN_ID, PIP_NODE_PLUGIN_ID, TRIGGER_TYPES, pipFlowOntology } from "./domain.ts";

const elementFiles = ["elements/styles.js", "elements/flow-styles.js", "elements/flow-geometry.js", "elements/flow-runtime-state.js", "elements/properties-element.js", "elements/contains-element.js", "elements/entry.js"];
const runtimeFiles = [
  "runtime/selectors.js", "runtime/project.js", "runtime/validation.js", "runtime/commands.js", "runtime/entry.js",
  "flow/selectors.js", "flow/compiler.js", "flow/validation.js", "flow/triggers.js", "flow/runtime.js", "flow/project.js", "flow/commands.js",
];

async function sources(paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [`source/${path}`, await readFile(new URL(path, import.meta.url), "utf8")])));
}
async function bundle(entry: string) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", minify: true });
  if (!result.outputFiles[0]) throw new Error(`Pip projection bundle ${entry} produced no output`);
  return result.outputFiles[0].text;
}

export async function buildPipProjectionPlugins() {
  const [elementSources, runtimeSources, elementSource, nodeTypeSource] = await Promise.all([
    sources(elementFiles), sources(runtimeFiles), bundle("elements/entry.js"), bundle("runtime/entry.js"),
  ]);
  const elementManifest = {
    ...baseElementManifest(PIP_ELEMENT_PLUGIN_ID, "Pip Projection Elements", Object.keys(elementSources)),
    elements: [
      { id: "properties", tag: "pip-properties-view", purpose: "projection" as const },
      { id: "contains", tag: "pip-contains-view", purpose: "projection" as const },
    ],
  };
  const elementPip = await encodeElementPackage(elementManifest, elementSource, elementSources), element = await decodeElementPackage(elementPip);
  const nodeManifest = baseNodeTypeManifest(PIP_NODE_PLUGIN_ID, "Pip Projection and Flow Types", [PROJECTION_INSTANCE_TYPE, ...FLOW_TYPES, ...TRIGGER_TYPES, ...EXECUTION_TYPES], [await exactPackageRef(elementPip, element.manifest)], Object.keys(runtimeSources));
  const nodeTypePip = await encodeNodeTypePackage(nodeManifest, pipFlowOntology, nodeTypeSource, runtimeSources), nodeType = await decodeNodeTypePackage(nodeTypePip);
  return { element, elementPip, nodeType, nodeTypePip };
}
