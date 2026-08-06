import assert from "node:assert/strict";
import test from "node:test";

import { pipIoOptionsFromArgs } from "../scripts/pip-io-cli.mjs";

test("CLI PIP limits map explicit startup arguments to policy fields", () => {
  const options = pipIoOptionsFromArgs([
    "--max-pip-size", "1024",
    "--max-resource-size", "unlimited",
    "--max-expanded-size", "2048",
    "--max-resource-count", "12",
    "--max-compression-ratio", "8",
  ]);
  assert.deepEqual(options.policy.maxPipBytes, { mode: "value", value: "1024" });
  assert.deepEqual(options.policy.maxSingleResourceBytes, { mode: "unlimited" });
  assert.deepEqual(options.policy.maxExpandedBytes, { mode: "value", value: "2048" });
  assert.deepEqual(options.policy.maxResourceCount, { mode: "value", value: "12" });
  assert.deepEqual(options.policy.maxCompressionRatio, { mode: "value", value: "8" });
});

test("non-interactive PIP operations report the exact missing flag", () => {
  const options = pipIoOptionsFromArgs([]);
  assert.throws(
    () => options.confirm({ field: "maxPipBytes", actual: "5", operation: "decode" }),
    /--max-pip-size <value\|unlimited>/,
  );
  assert.equal(
    pipIoOptionsFromArgs(["--allow-package-limits"]).confirm({
      field: "maxPipBytes",
      actual: "5",
      operation: "decode",
    }),
    true,
  );
});

test("CLI PIP limits reject missing, negative, and duplicate values", () => {
  assert.throws(() => pipIoOptionsFromArgs(["--max-pip-size"]), /requires/);
  assert.throws(() => pipIoOptionsFromArgs(["--max-pip-size", "-1"]), /requires/);
  assert.throws(
    () => pipIoOptionsFromArgs(["--max-pip-size", "1", "--max-pip-size", "2"]),
    /only be provided once/,
  );
});
