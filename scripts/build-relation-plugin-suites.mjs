import { mkdir, writeFile } from "node:fs/promises";
import { buildIntentPluginSuite } from "../plugins/intent/suite.ts";
import { buildScenePluginSuite } from "../plugins/scene/suite.ts";

const output = new URL("../dist/relation-plugins/", import.meta.url);
await mkdir(output, { recursive: true });

for (const [name, build] of [["intent", buildIntentPluginSuite], ["scene", buildScenePluginSuite]]) {
  const suite = await build();
  await Promise.all([
    writeFile(new URL(`${name}.intent-element.zip`, output), suite.elementArchive),
    writeFile(new URL(`${name}.intent-node-type.zip`, output), suite.nodeTypeArchive),
    writeFile(new URL(`${name}.intent-collection.zip`, output), suite.collectionArchive),
  ]);
}

console.log(`Built external RelationNode plugin suites in ${output.pathname}`);
