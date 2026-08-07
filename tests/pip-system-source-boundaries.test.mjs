import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { decodePip, pipSha256 } from "../app/runtime/pip.ts";
import { UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";
import { collectSourceAssets } from "../scripts/pip-source-assets.mjs";
import {
  SYSTEM_SOURCE_ENTRIES,
  systemSourceEntriesFor,
} from "../scripts/pip-system-sources.mjs";

const root = path.resolve(import.meta.dirname, "..");
const packages = {
  "pip-seed": "packages/system/a0/pip-seed/a0_pip_seed_1_0_0_20260806.pip",
  "pip-loader": "packages/system/a1/pip-loader/a1_loader_1_0_0_20260806.pip",
  "intent-map": "packages/system/a2/intent-map/a2_intent_map_1_0_0_20260806.pip",
  "software-authoring": "packages/system/a3/software-authoring/a3_software_authoring_1_0_0_20260806.pip",
};

test("every maintained system package has one explicit source boundary", () => {
  assert.deepEqual(Object.keys(SYSTEM_SOURCE_ENTRIES).sort(), Object.keys(packages).sort());
  assert.deepEqual(systemSourceEntriesFor("software-authoring"), [
    "a3",
    "scripts",
    "tests",
    "pip.release.json",
  ]);
  assert.throws(() => systemSourceEntriesFor("unknown-package"), /No maintained source boundary/);
});

test("system source PIPs exactly mirror their declared repository files", async () => {
  for (const [packageId, relative] of Object.entries(packages)) {
    const pip = await decodePip(
      new Uint8Array(await readFile(path.join(root, relative))),
      { policy: UNLIMITED_PIP_IO_POLICY },
    );
    const expected = (await collectSourceAssets(root, systemSourceEntriesFor(packageId)))
      .sort((left, right) => left.path.localeCompare(right.path));
    const actual = pip.assets.filter(({ path }) => path.startsWith("source/"));
    assert.deepEqual(actual.map(({ path }) => path), expected.map(({ path }) => path), packageId);
    for (let index = 0; index < actual.length; index += 1) {
      assert.equal(
        await pipSha256(actual[index].bytes),
        await pipSha256(expected[index].bytes),
        `${packageId}: ${actual[index].path}`,
      );
    }
  }
});
