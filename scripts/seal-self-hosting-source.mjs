import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  collectReconstructedSources,
  sha256,
  sourceTreeSha256,
} from "./pip-self-hosting-source.mjs";

const sourceArgument = process.argv[2];
if (!sourceArgument || sourceArgument.startsWith("--")) {
  throw new Error("Usage: npm run pip:self:seal -- <edited-source-directory>");
}

const source = path.resolve(sourceArgument);
const receiptDirectory = path.join(source, ".pip");
const parentReceiptBytes = await readFile(
  path.join(receiptDirectory, "self-hosting-source-receipt.json"),
);
const parentReceipt = JSON.parse(parentReceiptBytes);
if (parentReceipt.kind !== "pip-self-hosting-source/1") {
  throw new Error("Unsupported parent self-hosting source receipt");
}
const assets = await collectReconstructedSources(source);
const receipt = {
  schemaVersion: 1,
  kind: "pip-self-hosting-candidate-source/1",
  parentSourceReceiptSha256: sha256(parentReceiptBytes),
  parentSourceTreeSha256: parentReceipt.reconstructedSourceTreeSha256,
  sourceTreeSha256: sourceTreeSha256(assets),
  sourceFileCount: assets.length,
};
const destination = path.join(receiptDirectory, "self-hosting-candidate-source-receipt.json");
await writeFile(destination, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${destination}\n${receipt.sourceFileCount} source files\n`);
