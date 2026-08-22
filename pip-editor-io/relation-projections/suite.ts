import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/relation-host/packages/element-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/relation-host/packages/node-type-package.ts";
import { exactPackageRef } from "../../pip-editor/relation-host/packages/pip-package.ts";
import { baseElementManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { PROJECTION_INSTANCE_TYPE, RELATION_ELEMENT_PLUGIN_ID, RELATION_NODE_PLUGIN_ID, relationProjectionOntology } from "./domain.ts";

const elementFiles = ["elements/styles.js", "elements/properties-element.js", "elements/contains-element.js", "elements/entry.js"];
const runtimeFiles = ["runtime/selectors.js", "runtime/project.js", "runtime/validation.js", "runtime/commands.js", "runtime/entry.js"];

async function sources(paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [`source/${path}`, await readFile(new URL(path, import.meta.url), "utf8")])));
}
async function bundle(entry: string) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", minify: true });
  if (!result.outputFiles[0]) throw new Error(`Relation projection bundle ${entry} produced no output`);
  return result.outputFiles[0].text;
}

export async function buildRelationProjectionPlugins() {
  const [elementSources, runtimeSources, elementSource, nodeTypeSource] = await Promise.all([
    sources(elementFiles), sources(runtimeFiles), bundle("elements/entry.js"), bundle("runtime/entry.js"),
  ]);
  const elementManifest = {
    ...baseElementManifest(RELATION_ELEMENT_PLUGIN_ID, "Relation Projection Elements", Object.keys(elementSources)),
    elements: [
      { id: "properties", tag: "relation-properties-view", purpose: "projection" as const },
      { id: "contains", tag: "relation-contains-view", purpose: "projection" as const },
    ],
  };
  const elementPip = await encodeElementPackage(elementManifest, elementSource, elementSources), element = await decodeElementPackage(elementPip);
  const nodeManifest = baseNodeTypeManifest(RELATION_NODE_PLUGIN_ID, "Relation Projection Types", [PROJECTION_INSTANCE_TYPE], [await exactPackageRef(elementPip, element.manifest)], Object.keys(runtimeSources));
  const nodeTypePip = await encodeNodeTypePackage(nodeManifest, relationProjectionOntology, nodeTypeSource, runtimeSources), nodeType = await decodeNodeTypePackage(nodeTypePip);
  return { element, elementPip, nodeType, nodeTypePip };
}
