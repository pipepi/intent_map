import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/relation-host/packages/element-package.ts";
import { encodeNodeMapPackage } from "../../pip-editor/relation-host/packages/node-map-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/relation-host/packages/node-type-package.ts";
import { exactPackageRef } from "../../pip-editor/relation-host/packages/pip-package.ts";
import { baseElementManifest, baseNodeMapManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { sceneNodeMapData, sceneOntology, SCENE_NODE_MAP_ID, SCENE_ELEMENT_PLUGIN_ID, SCENE_NODE_PLUGIN_ID, SCENE_TYPES } from "./domain.ts";

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
  const elementPip = await encodeElementPackage(elementManifest, elementSource, elementSources);
  const element = await decodeElementPackage(elementPip);
  const nodeManifest = baseNodeTypeManifest(
    SCENE_NODE_PLUGIN_ID, "Scene Relation Types", SCENE_TYPES, [await exactPackageRef(elementPip, element.manifest)], Object.keys(nodeSources),
  );
  const nodeTypePip = await encodeNodeTypePackage(nodeManifest, sceneOntology, nodeTypeSource, nodeSources);
  const nodeType = await decodeNodeTypePackage(nodeTypePip);
  const nodeMap = {
    manifest: baseNodeMapManifest(SCENE_NODE_MAP_ID, "小明的今天", ["scene.view.quadrant", "scene.view.tube"], [await exactPackageRef(nodeTypePip, nodeType.manifest)]),
    ...sceneNodeMapData,
  };
  const nodeMapPip = await encodeNodeMapPackage({ nodeMap, nodeTypes: [nodeType], elementPlugins: [element] });
  return { elementPip, nodeTypePip, nodeMapPip, element, nodeType, nodeMap };
}
