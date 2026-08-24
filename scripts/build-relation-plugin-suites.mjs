import { mkdir, writeFile } from "node:fs/promises";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { buildSpotTerminalPluginSuite } from "../pip-editor-io/spot-terminal/suite.ts";
import { pipFilename } from "../pip-editor/pip/manifest.ts";

const output = new URL("../dist/pip-editor-io/", import.meta.url);
await mkdir(output, { recursive: true });

for (const build of [buildIntentPluginSuite, buildScenePluginSuite, buildSpotTerminalPluginSuite]) {
  const suite = await build();
  const outputs = [
    writeFile(new URL(pipFilename(suite.element.manifest), output), suite.elementPip),
    writeFile(new URL(pipFilename(suite.nodeType.manifest), output), suite.nodeTypePip),
    ...(suite.nodeMap ? [writeFile(new URL(pipFilename(suite.nodeMap.manifest), output), suite.nodeMapPip)] : []),
  ];
  if (suite.support) outputs.push(
    writeFile(new URL(pipFilename(suite.support.element.manifest), output), suite.support.elementPip),
    writeFile(new URL(pipFilename(suite.support.nodeType.manifest), output), suite.support.nodeTypePip),
  );
  await Promise.all(outputs);
}

console.log(`Built external RelationNode plugin suites in ${output.pathname}`);
