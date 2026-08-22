import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/relation-host/packages/element-package.ts";
import { encodeCollectionPackage } from "../../pip-editor/relation-host/packages/collection-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/relation-host/packages/node-type-package.ts";
import { baseElementManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { sceneCollection, sceneOntology, SCENE_ELEMENT_PLUGIN_ID, SCENE_NODE_PLUGIN_ID, SCENE_TYPES } from "./domain.ts";

export * from "./domain.ts";

const elementFiles = ["elements/styles.js", "elements/render.js", "elements/view-element.js", "elements/entry.js"];
const nodeTypeFiles = [
  "runtime/selectors.js", "runtime/geometry.js", "runtime/project.js",
  "runtime/commands.js", "runtime/language.js", "runtime/entry.js",
];

async function sources(paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [
    `source/${path}`, await readFile(new URL(path, import.meta.url), "utf8"),
  ])));
}

async function bundle(entry: string) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, write: false,
    format: "esm", platform: "browser", target: "es2022", minify: true,
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error(`Scene bundle ${entry} produced no output`);
  return output.text;
}

export async function buildScenePluginSuite() {
  const [elementSources, nodeSources, elementSource, nodeTypeSource] = await Promise.all([
    sources(elementFiles), sources(nodeTypeFiles), bundle("elements/entry.js"), bundle("runtime/entry.js"),
  ]);
  const elementManifest = {
    ...baseElementManifest(SCENE_ELEMENT_PLUGIN_ID, "Scene Elements", Object.keys(elementSources)),
    elements: [
      { id: "quadrant", tag: "scene-quadrant-view", purpose: "projection" as const },
      { id: "tube", tag: "scene-tube-view", purpose: "projection" as const },
    ],
  };
  const elementArchive = await encodeElementPackage(elementManifest, elementSource, elementSources);
  const element = await decodeElementPackage(elementArchive);
  const nodeManifest = baseNodeTypeManifest(
    SCENE_NODE_PLUGIN_ID, "Scene Relation Types", SCENE_TYPES, SCENE_ELEMENT_PLUGIN_ID, Object.keys(nodeSources),
  );
  const nodeArchive = await encodeNodeTypePackage(nodeManifest, sceneOntology, nodeTypeSource, nodeSources);
  const nodeType = await decodeNodeTypePackage(nodeArchive);
  const collectionArchive = encodeCollectionPackage({ collection: sceneCollection, nodeTypes: [nodeType], elementPlugins: [element] });
  return { elementArchive, nodeTypeArchive: nodeArchive, collectionArchive, element, nodeType, collection: sceneCollection };
}
