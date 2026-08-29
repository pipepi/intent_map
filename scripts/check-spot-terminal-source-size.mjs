import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = new URL("../pip-editor-io/spot-terminal/", import.meta.url);
const spotTests = new URL("../tests/", import.meta.url);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(new URL(`${entry.name}/`, directory)) : [new URL(entry.name, directory)]))).flat();
}
const oversized = [];
for (const file of [...await files(root), ...await files(spotTests)]) {
  if (file.pathname.includes("/tests/") && !path.basename(file.pathname).startsWith("spot-terminal-")) continue;
  if (!/[.](?:js|ts|css)$/.test(file.pathname)) continue;
  const count = (await readFile(file, "utf8")).split(/\r?\n/).length;
  if (count > 300) oversized.push(`${path.relative(process.cwd(), file.pathname)}: ${count}`);
}
if (oversized.length) throw new Error(`Spot terminal source files exceed 300 lines:\n${oversized.join("\n")}`);
console.log("Spot terminal source-size check passed");
