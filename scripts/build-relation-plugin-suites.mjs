import { mkdir, writeFile } from "node:fs/promises";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { pipFilename } from "../pip-editor/pip/manifest.ts";

const output = new URL("../dist/pip-editor-io/", import.meta.url);
await mkdir(output, { recursive: true });

for (const build of [buildIntentPluginSuite, buildScenePluginSuite]) {
  const suite = await build();
  await Promise.all([
    writeFile(new URL(pipFilename(suite.element.manifest), output), suite.elementPip),
    writeFile(new URL(pipFilename(suite.nodeType.manifest), output), suite.nodeTypePip),
    writeFile(new URL(pipFilename(suite.nodeMap.manifest), output), suite.nodeMapPip),
  ]);
}

console.log(`Built external RelationNode plugin suites in ${output.pathname}`);
